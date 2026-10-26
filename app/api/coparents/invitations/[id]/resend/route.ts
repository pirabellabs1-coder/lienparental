import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { mailInvitation } from '@/lib/coparents/server/invite'
import { uuidSchema } from '@/lib/coparents/validation'
import type { GuardianRole, IssuedInvitation } from '@/lib/coparents/types'

// POST /api/coparents/invitations/[id]/resend : nouveau jeton (l'ancien lien cesse de
// fonctionner), validité repoussée de 7 jours, e-mail renvoyé. 1 renvoi / minute, 10 au total.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return jsonError(404, 'not_found', 'Invitation introuvable.')
  const tooMany = await limited(ctx.user.id, 'invite', 10, 10 * 60_000)
  if (tooMany) return tooMany

  const { data, error } = await ctx.db.rpc('resend_family_invitation', { p_invitation_id: id })
  if (error) return rpcError(error, 'invitation.resend', 'Invitation introuvable ou déjà traitée.')
  const row = (data as { token: string; expires_at: string; invitee_email: string; role: GuardianRole }[] | null)?.[0]
  if (!row) return jsonError(500, 'db_error', 'L’invitation n’a pas pu être renvoyée.')

  const { data: inv } = await ctx.db.from('family_invitations').select('sent_count').eq('id', id).maybeSingle()
  const emailStatus = await mailInvitation(ctx, {
    invitationId: id, email: row.invitee_email, role: row.role, token: row.token, expiresAt: row.expires_at,
    sendNumber: (inv as { sent_count?: number } | null)?.sent_count ?? Date.now(),
  })
  const body: IssuedInvitation = { id, email: row.invitee_email, role: row.role, token: row.token, expiresAt: row.expires_at, emailStatus }
  return jsonOk(body)
}
