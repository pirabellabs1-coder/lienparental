import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { createServiceClient } from '@/lib/supabase/server'
import { encryptMedical, medicalCryptoReady } from '@/lib/data/server/medical-crypto'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { loadHealthRows, openChildMedical, rewrapHealthRow } from '@/lib/coparents/server/health'
import { mergeSchema } from '@/lib/coparents/validation'
import type { MergeResult } from '@/lib/coparents/types'

// POST /api/coparents/merge { dropChildId, keepChildId, confirm: true }
// Fusion guidée d'une fiche en double : MA fiche (drop) rejoint la fiche partagée (keep).
// Les données de santé sont chiffrées avec l'id de l'enfant en AAD : elles sont
// déchiffrées puis re-chiffrées ici, et la base applique tout en une transaction
// (merge_child_into_as, 0360), qui vérifie à nouveau droits et dates de naissance.
// m2 (audit v3) : la RPC n'est plus exécutable par `authenticated` ; elle est appelée
// en service_role APRÈS les contrôles de session (familyContext : session revalidée,
// aal2 si 2FA, même origine) avec l'identifiant issu de la session. Elle ne déplace
// que les lignes de l'appelant et n'écrit pas les infos médicales d'une fiche dont
// il n'est pas titulaire.
export const dynamic = 'force-dynamic'

type ChildRow = { id: string; user_id: string; date_naissance: string; infos_medicales: unknown }

export async function POST(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const t = await getTranslations('server.coparents')
  const tooMany = await limited(ctx.user.id, 'merge', 5, 10 * 60_000)
  if (tooMany) return tooMany

  const parsed = mergeSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(422, 'invalid', t('mergeConfirm'))
  const { dropChildId, keepChildId } = parsed.data
  if (dropChildId === keepChildId) return jsonError(422, 'invalid', t('mergeInvalid'))

  const { data: kids, error: kErr } = await ctx.db
    .from('children').select('id, user_id, date_naissance, infos_medicales')
    .in('id', [dropChildId, keepChildId]).is('deleted_at', null)
  if (kErr) return rpcError(kErr, 'merge.children')
  const drop = ((kids ?? []) as ChildRow[]).find((c) => c.id === dropChildId)
  const keep = ((kids ?? []) as ChildRow[]).find((c) => c.id === keepChildId)
  if (!drop || !keep) return jsonError(404, 'not_found', t('childRecordNotFound'))
  if (drop.user_id !== ctx.user.id) return jsonError(403, 'forbidden', t('mergeOwnOnly'))
  if (drop.date_naissance !== keep.date_naissance) {
    return jsonError(422, 'birthdate_mismatch', t('hints.birthdate_mismatch'))
  }

  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    return jsonError(503, 'not_configured', t('mergeNotConfigured'))
  }

  // Seules MES entrées sont déplacées (celles d'autres adultes restent sur ma fiche archivée).
  const all = await loadHealthRows(ctx.db, dropChildId)
  if (!all) return jsonError(500, 'db_error', t('healthReadFailed'))
  const rows = all.filter((r) => r.user_id === ctx.user.id)
  // Infos médicales générales : reprises seulement si la fiche conservée n'en a pas ET
  // que j'en suis titulaire (un gardien ne peut pas les écrire, garde 0340).
  const copyMedical = keep.user_id === ctx.user.id && keep.infos_medicales == null && drop.infos_medicales != null
  const needsCrypto = rows.length > 0 || copyMedical
  if (needsCrypto && !medicalCryptoReady()) {
    return jsonError(503, 'encryption_not_configured', t('encryptionNotConfigured'))
  }

  const health = rows.map((r) => ({ kind: r.kind, id: r.id, payload: rewrapHealthRow(dropChildId, keepChildId, r) }))

  let keepMedical: unknown = null
  if (copyMedical) {
    const clear = openChildMedical(drop.user_id, dropChildId, drop.infos_medicales)
    if (clear !== null) keepMedical = encryptMedical(keep.user_id, keepChildId, clear)
  }

  const { data, error } = await admin.rpc('merge_child_into_as', {
    p_actor_id: ctx.user.id,
    p_drop_child_id: dropChildId,
    p_keep_child_id: keepChildId,
    p_health: health,
    p_keep_medical: keepMedical,
  })
  if (error) return rpcError(error, 'merge', t('childRecordNotFound'))
  const r = (data ?? {}) as { kept_child_id?: string; health_moved?: number; references_updated?: number; guardians_revoked?: number }
  const body: MergeResult = {
    keptChildId: r.kept_child_id ?? keepChildId,
    healthMoved: r.health_moved ?? 0,
    referencesUpdated: r.references_updated ?? 0,
    guardiansRevoked: r.guardians_revoked ?? 0,
  }
  return jsonOk(body)
}
