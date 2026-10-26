import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { uuidSchema } from '@/lib/coparents/validation'

// DELETE /api/coparents/invitations/[id] : annule une invitation en attente (invitant uniquement).
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: Request, { params }: Ctx) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return jsonError(404, 'not_found', 'Invitation introuvable.')
  const tooMany = await limited(ctx.user.id, 'write', 60, 60_000)
  if (tooMany) return tooMany

  const { error } = await ctx.db.rpc('cancel_family_invitation', { p_invitation_id: id })
  if (error) return rpcError(error, 'invitation.cancel', 'Invitation introuvable ou déjà traitée.')
  return jsonOk({ ok: true })
}
