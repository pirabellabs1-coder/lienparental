import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { medicalCryptoReady } from '@/lib/data/server/medical-crypto'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { HEALTH_NOT_SHARED_MESSAGE, isProcheOf, loadHealthRows, openChildMedical, openHealthRow } from '@/lib/coparents/server/health'

// GET /api/coparents/enfants/[id]/sante : santé PARTAGÉE d'un enfant (titulaire ou
// gardien « parent » actif, MFA respectée). Contrairement à /api/enfants/[id]/sante
// (propriétaire uniquement), chaque entrée est déchiffrée avec la clé de SON AUTEUR.
// Lecture seule ; l'écriture reste celle de la fiche (voir docs/FAMILLE.md §6).
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const vaccination = z.object({ nom: z.string().max(80), date: day, rappel: z.string().optional() }).passthrough()
const traitement = z.object({ nom: z.string().max(80), posologie: z.string().max(160).optional(), debut: day, fin: z.string().optional() }).passthrough()
const medical = z.object({
  allergies: z.array(z.string().max(60)).max(30).default([]),
  autresAllergies: z.string().max(300).optional(),
  infosMedicales: z.string().max(1000).optional(),
  groupeSanguin: z.string().max(10).optional(),
  traitement: z.string().max(300).optional(),
  medecinTraitant: z.string().max(200).optional(),
}).passthrough()

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await familyContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return jsonError(404, 'not_found', 'Profil introuvable.')
  const tooMany = await limited(ctx.user.id, 'read', 120, 60_000)
  if (tooMany) return tooMany

  // Visible uniquement pour le titulaire ou un gardien « parent » (RLS 0340).
  const { data: child, error } = await ctx.db.from('children').select('id, user_id, infos_medicales').eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) return rpcError(error, 'sante.child')
  if (!child) {
    // Proche lié : refus explicite (aucune donnée de santé), tiers : 404.
    if (await isProcheOf(ctx.db, id)) return jsonError(403, 'health_not_shared', HEALTH_NOT_SHARED_MESSAGE)
    return jsonError(404, 'not_found', 'Profil introuvable.')
  }
  const c = child as { id: string; user_id: string; infos_medicales: unknown }
  if (!medicalCryptoReady()) return jsonOk({ medical: null, vaccinations: [], traitements: [], unavailable: true })

  const rows = await loadHealthRows(ctx.db, id)
  if (!rows) return jsonError(500, 'db_error', 'Lecture impossible pour le moment.')

  let unreadable = 0
  const out = { vaccinations: [] as object[], traitements: [] as object[] }
  for (const r of rows) {
    const clear = openHealthRow(id, r)
    const parsed = (r.kind === 'vaccination' ? vaccination : traitement).safeParse(clear)
    if (!parsed.success) { unreadable++; continue }
    const item = { id: r.id, ...parsed.data, createdAt: r.created_at, byMe: r.user_id === ctx.user.id }
    if (r.kind === 'vaccination') out.vaccinations.push(item)
    else out.traitements.push(item)
  }
  const med = c.infos_medicales ? medical.safeParse(openChildMedical(c.user_id, id, c.infos_medicales)) : null
  if (med && !med.success) unreadable++
  return jsonOk({ medical: med?.success ? med.data : null, ...out, unavailable: unreadable > 0 })
}
