import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { cleanDate } from '@/lib/prefill'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { encryptMedical, medicalCryptoReady } from '@/lib/data/server/medical-crypto'
import { isProcheOf, loadHealthRows, openHealthRow } from '@/lib/coparents/server/health'

// Espace Santé d'un enfant : vaccinations et traitements (données de santé, RGPD art. 9).
// Chiffrement AES-256-GCM exclusivement côté serveur (même clé dérivée par utilisateur que
// children.infos_medicales) ; AAD = "<childId>:<kind>:<rowId>" → un payload déplacé ne se
// déchiffre pas. Accès (docs/FAMILLE.md) : lecture par le titulaire et les parents liés, ajout de
// SES propres entrées (RLS insert 0340), suppression de ses propres entrées. Aucune donnée de santé
// ne transite dans l'URL : tout passe dans le corps JSON (POST/DELETE) ou la réponse (GET).

export const dynamic = 'force-dynamic'

const KINDS = ['vaccination', 'traitement'] as const
type Kind = (typeof KINDS)[number]
const TABLE: Record<Kind, string> = { vaccination: 'child_vaccinations', traitement: 'child_treatments' }

// Écriture : date calendaire réelle (rejette 2026-02-31, bornée 1900–2100), même contrôle
// que lib/prefill.ts#cleanDate. Lecture : ancienne règle, plus tolérante (Date.parse accepte
// 2026-02-31), pour ne pas masquer des entrées enregistrées avant ce durcissement.
const day = z.string().refine((s) => cleanDate(s) === s)
const storedDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
const emptyToUndef = z.literal('').transform(() => undefined)

/**
 * « Aujourd'hui » toléré pour une date passée : jour UTC de now + 14 h (fuseau le plus
 * avancé, UTC+14), pour ne refuser aucun utilisateur dont le jour local a déjà changé.
 */
const latestToday = () => new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10)
const text = (min: number, max: number) => z.string().trim().min(min).max(max)

// Forme stockée (relecture des payloads déchiffrés).
const vaccinationSchema = z.object({
  nom: text(1, 80),
  date: storedDay,
  rappel: storedDay.optional().or(emptyToUndef),
}).strict()

const traitementSchema = z.object({
  nom: text(1, 80),
  posologie: text(0, 160).optional(),
  debut: storedDay,
  fin: storedDay.optional().or(emptyToUndef),
}).strict()

// Écriture : dates réelles + mêmes règles que lib/data/health.ts (rappel postérieur à la
// vaccination, fin ≥ début) + vaccination déjà réalisée (date ≤ aujourd'hui).
const vaccinationWriteSchema = z.object({
  nom: text(1, 80),
  date: day,
  rappel: day.optional().or(emptyToUndef),
}).strict()
  .refine((v) => v.date <= latestToday(), { message: 'date future' })
  .refine((v) => !v.rappel || v.rappel > v.date, { message: 'rappel <= date' })

const traitementWriteSchema = z.object({
  nom: text(1, 80),
  posologie: text(0, 160).optional(),
  debut: day,
  fin: day.optional().or(emptyToUndef),
}).strict().refine((t) => !t.fin || t.fin >= t.debut, { message: 'fin < debut' })

const createSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('vaccination'), item: vaccinationWriteSchema }),
  z.object({ kind: z.literal('traitement'), item: traitementWriteSchema }),
])
const deleteSchema = z.object({ kind: z.enum(KINDS), itemId: z.string().uuid() }).strict()

type Ctx = { params: Promise<{ id: string }> }

const aad = (childId: string, kind: Kind, rowId: string) => `${childId}:${kind}:${rowId}`

async function authed(ctx: Ctx) {
  const t = await getTranslations('server.enfants')
  const tc = await getTranslations('server.common')
  if (!SUPABASE_ENABLED) return { error: jsonError(503, 'not_configured', t('notConfigured')) } as const
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) return { error: jsonError(404, 'not_found', t('profileNotFound')) } as const
  // Session revalidée + aal2 exigé si la 2FA est activée (données de santé).
  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? { error: jsonError(403, 'mfa_required', tc('denied.mfa_required')) } as const
      : { error: jsonError(401, 'unauthenticated', tc('denied.unauthenticated')) } as const
  }
  const { supabase, user } = auth
  // Les tables 0260 ne sont pas encore dans les types générés.
  const raw = supabase as unknown as SupabaseClient
  // L'enfant doit être visible : titulaire ou gardien « parent » actif (RLS 0340, children_select_family).
  // Un proche ne voit pas la ligne → 403 explicite ; un tiers → 404 propre.
  const { data: child, error } = await raw
    .from('children').select('id, user_id').eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) return { error: jsonError(500, 'db_error', t('readFailed')) } as const
  if (!child) {
    if (await isProcheOf(raw, id)) return { error: jsonError(403, 'health_not_shared', t('healthNotShared')) } as const
    return { error: jsonError(404, 'not_found', t('profileNotFound')) } as const
  }
  return { db: raw, user, id, isOwner: (child as { user_id: string }).user_id === user.id } as const
}

async function limited(userId: string) {
  const r = await rateLimit(userKey('sante', userId), 60, 60_000)
  if (r.ok) return null
  const t = await getTranslations('server.enfants')
  return jsonError(429, 'rate_limited', t('tooManyChanges'), { 'Retry-After': String(r.retryAfter) })
}

export async function GET(_req: Request, ctx: Ctx) {
  const a = await authed(ctx)
  if ('error' in a) return a.error
  if (!medicalCryptoReady()) return jsonOk({ vaccinations: [], traitements: [], unavailable: true })

  // Toutes les entrées visibles (les miennes + celles des autres parents liés, RLS 0340),
  // chacune déchiffrée avec la clé de SON AUTEUR (lib/coparents/server/health.ts).
  const rows = await loadHealthRows(a.db, a.id)
  if (!rows) return jsonError(500, 'db_error', (await getTranslations('server.enfants'))('readFailed'))

  let unreadable = 0
  const vaccinations: object[] = []
  const traitements: object[] = []
  for (const r of rows) {
    const clear = openHealthRow(a.id, r)
    const p = (r.kind === 'vaccination' ? vaccinationSchema : traitementSchema).safeParse(clear)
    if (clear === null || !p.success) { unreadable++; continue }
    // byMe : seul l'auteur peut supprimer son entrée (DELETE filtre user_id).
    const item = { id: r.id, ...(p.data as object), createdAt: r.created_at, byMe: r.user_id === a.user.id }
    if (r.kind === 'vaccination') vaccinations.push(item)
    else traitements.push(item)
  }
  if (unreadable) console.warn('[api/enfants/sante] entrées indéchiffrables :', unreadable)
  return jsonOk({ vaccinations, traitements, unavailable: unreadable > 0, readOnly: !a.isOwner })
}

export async function POST(req: Request, ctx: Ctx) {
  const a = await authed(ctx)
  if ('error' in a) return a.error
  const tooMany = await limited(a.user.id)
  if (tooMany) return tooMany
  const t = await getTranslations('server.enfants')
  if (!medicalCryptoReady()) {
    return jsonError(503, 'encryption_not_configured', t('healthEncryptionMissing'))
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(422, 'invalid', t('healthInvalid'))

  const { kind, item } = parsed.data
  const rowId = randomUUID()
  const payload = encryptMedical(a.user.id, aad(a.id, kind, rowId), item)
  const { data, error } = await a.db
    .from(TABLE[kind])
    .insert({ id: rowId, user_id: a.user.id, child_id: a.id, payload })
    .select('id, created_at')
    .single()
  if (error || !data) return jsonError(500, 'db_error', t('saveFailed'))
  const row = data as { id: string; created_at: string }
  return jsonOk({ item: { id: row.id, ...item, createdAt: row.created_at } }, 201)
}

export async function DELETE(req: Request, ctx: Ctx) {
  const a = await authed(ctx)
  if ('error' in a) return a.error
  const tooMany = await limited(a.user.id)
  if (tooMany) return tooMany
  const t = await getTranslations('server.enfants')
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(422, 'invalid', t('invalidRequest'))

  // Suppression réelle (minimisation RGPD : une donnée de santé retirée n'est pas conservée).
  const { data, error } = await a.db
    .from(TABLE[parsed.data.kind])
    .delete()
    .eq('id', parsed.data.itemId)
    .eq('child_id', a.id)
    .eq('user_id', a.user.id)
    .select('id')
  if (error) return jsonError(500, 'db_error', t('deleteFailed'))
  if (!data || data.length === 0) return jsonError(404, 'not_found', t('itemNotFound'))
  return jsonOk({ ok: true })
}
