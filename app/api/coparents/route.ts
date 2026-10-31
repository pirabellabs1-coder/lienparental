import { jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { toChildren, toConflicts, toMerge, toReceived, toSent } from '@/lib/coparents/server/map'
import type { FamilyOverview } from '@/lib/coparents/types'

// GET /api/coparents : adultes liés par enfant, invitations envoyées et reçues,
// fiches en double à fusionner. Tout passe par les RPC 0340 (RLS + MFA).
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await familyContext()
  if ('error' in ctx) return ctx.error
  const tooMany = await limited(ctx.user.id, 'read', 120, 60_000)
  if (tooMany) return tooMany

  const [members, sent, received, merge, conflicts] = await Promise.all([
    ctx.db.rpc('list_family_members'),
    ctx.db.rpc('list_sent_family_invitations'),
    ctx.db.rpc('list_received_family_invitations'),
    ctx.db.rpc('list_merge_candidates'),
    // 0630 : homonymes à date différente ; absente avant la migration (liste vide, jamais bloquant).
    ctx.db.rpc('list_child_name_conflicts'),
  ])
  const failed = members.error ?? sent.error ?? received.error ?? merge.error
  if (failed) return rpcError(failed, 'overview')

  const body: FamilyOverview = {
    children: toChildren((members.data ?? []) as Parameters<typeof toChildren>[0]),
    sent: toSent((sent.data ?? []) as Parameters<typeof toSent>[0]),
    received: toReceived((received.data ?? []) as Parameters<typeof toReceived>[0]),
    mergeCandidates: toMerge((merge.data ?? []) as Parameters<typeof toMerge>[0]),
    nameConflicts: conflicts.error ? [] : toConflicts((conflicts.data ?? []) as Parameters<typeof toConflicts>[0]),
  }
  return jsonOk(body)
}
