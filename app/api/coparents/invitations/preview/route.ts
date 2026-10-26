import { jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { familyTokenSchema, previewSchema } from '@/lib/coparents/validation'
import type { GuardianRole, InvitationChild, InvitationPreview } from '@/lib/coparents/types'

// POST /api/coparents/invitations/preview { token } : détail d'une invitation avant
// acceptation. Jeton dans le corps (jamais dans une URL d'API journalisée).
// Détails visibles uniquement par le compte dont l'e-mail vérifié est l'invité.
export const dynamic = 'force-dynamic'

type Row = {
  id: string; status: string; email_matches: boolean; invitee_hint: string
  inviter_prenom: string | null; role: GuardianRole | null; children: InvitationChild[] | null; expires_at: string
}

export async function POST(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const tooMany = await limited(ctx.user.id, 'preview', 30, 10 * 60_000)
  if (tooMany) return tooMany

  const body = previewSchema.safeParse(await readJson(req))
  if (!body.success || !familyTokenSchema.safeParse(body.data.token).success) return jsonOk<InvitationPreview>({ state: 'invalid' })

  const { data, error } = await ctx.db.rpc('get_family_invitation', { p_token: body.data.token })
  if (error) return rpcError(error, 'invitation.preview')
  const row = (data as Row[] | null)?.[0]
  if (!row) return jsonOk<InvitationPreview>({ state: 'invalid' })
  if (row.status === 'expired' || row.status === 'accepted' || row.status === 'cancelled' || row.status === 'declined') {
    return jsonOk<InvitationPreview>({ state: row.status })
  }
  if (!row.email_matches) return jsonOk<InvitationPreview>({ state: 'other_account', inviteeHint: row.invitee_hint })
  return jsonOk<InvitationPreview>({
    state: 'ready',
    id: row.id,
    inviterPrenom: row.inviter_prenom ?? '',
    role: row.role ?? 'parent',
    children: row.children ?? [],
    expiresAt: row.expires_at,
  })
}
