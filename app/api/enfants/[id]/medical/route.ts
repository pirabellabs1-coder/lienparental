import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { encryptMedical, isEncryptedPayload, medicalCryptoReady } from '@/lib/data/server/medical-crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isProcheOf, openChildMedical } from '@/lib/coparents/server/health'

// Informations médicales d'un enfant (données de santé, RGPD art. 9).
// Chiffrement/déchiffrement AES-256-GCM exclusivement côté serveur ;
// la BDD ne voit que le ciphertext. Lecture : titulaire ou parent lié (RLS 0340, docs/FAMILLE.md) ;
// écriture : titulaire uniquement (filtre user_id + trigger children_guard_family_update).

export const dynamic = 'force-dynamic'

const text = (max: number) => z.string().trim().max(max).optional()
const medicalSchema = z.object({
  allergies: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  autresAllergies: text(300),
  infosMedicales: text(1000),
  groupeSanguin: text(10),
  traitement: text(300),
  medecinTraitant: text(200),
}).strict()

type Ctx = { params: Promise<{ id: string }> }

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
  return { supabase: auth.supabase, user: auth.user, id } as const
}

export async function GET(_req: Request, ctx: Ctx) {
  const a = await authed(ctx)
  if ('error' in a) return a.error
  const t = await getTranslations('server.enfants')
  // Lecture : titulaire OU gardien « parent » actif (RLS children_select_family, 0340) ;
  // pas de filtre user_id ici, la RLS fait foi. Un proche ne voit pas la ligne → 403
  // explicite (health_not_shared) ; un tiers → 404.
  const { data, error } = await a.supabase
    .from('children')
    .select('id, user_id, infos_medicales')
    .eq('id', a.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return jsonError(500, 'db_error', t('readFailed'))
  if (!data) {
    if (await isProcheOf(a.supabase as unknown as SupabaseClient, a.id)) return jsonError(403, 'health_not_shared', t('healthNotShared'))
    return jsonError(404, 'not_found', t('profileNotFound'))
  }

  const row = data as { user_id: string; infos_medicales: unknown }
  const readOnly = row.user_id !== a.user.id
  const payload = row.infos_medicales
  if (!payload) return jsonOk({ medical: null, readOnly })
  if (!medicalCryptoReady() || !isEncryptedPayload(payload)) return jsonOk({ medical: null, unavailable: true, readOnly })
  // Clé dérivée du TITULAIRE de la fiche (AAD = id de l'enfant), même logique que la santé partagée.
  const clear = medicalSchema.safeParse(openChildMedical(row.user_id, a.id, payload))
  if (!clear.success) {
    console.warn('[api/enfants/medical] déchiffrement impossible')
    return jsonOk({ medical: null, unavailable: true, readOnly })
  }
  return jsonOk({ medical: clear.data, readOnly })
}

export async function PUT(req: Request, ctx: Ctx) {
  const a = await authed(ctx)
  if ('error' in a) return a.error
  const t = await getTranslations('server.enfants')
  if (!medicalCryptoReady()) {
    return jsonError(503, 'encryption_not_configured', t('medicalEncryptionMissing'))
  }
  const body = (await req.json().catch(() => null)) as { medical?: unknown } | null
  const parsed = medicalSchema.safeParse(body?.medical)
  if (!parsed.success) return jsonError(422, 'invalid', t('medicalInvalid'))

  const isEmpty = parsed.data.allergies.length === 0 &&
    !parsed.data.autresAllergies && !parsed.data.infosMedicales && !parsed.data.groupeSanguin &&
    !parsed.data.traitement && !parsed.data.medecinTraitant
  const infos = isEmpty ? null : encryptMedical(a.user.id, a.id, parsed.data)

  const { data, error } = await a.supabase
    .from('children')
    .update({ infos_medicales: infos })
    .eq('id', a.id)
    .eq('user_id', a.user.id)
    .is('deleted_at', null)
    .select('id')
  if (error) return jsonError(500, 'db_error', t('saveFailed'))
  if (!data || data.length === 0) return jsonError(404, 'not_found', t('profileNotFound'))
  return jsonOk({ ok: true })
}
