import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { mailInvitation } from '@/lib/coparents/server/invite'
import { createInvitationSchema } from '@/lib/coparents/validation'
import type { IssuedInvitation } from '@/lib/coparents/types'

// POST /api/coparents/invitations : invite un adulte (e-mail nominatif) pour un ou
// plusieurs enfants. Le jeton n'est renvoyé qu'ici (la base n'en garde que le SHA-256).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const tooMany = await limited(ctx.user.id, 'invite', 10, 10 * 60_000)
  if (tooMany) return tooMany

  const parsed = createInvitationSchema.safeParse(await readJson(req))
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    return jsonError(422, 'invalid', msg && msg !== 'Required' && !msg.startsWith('Invalid') ? msg : 'Certaines informations sont invalides.')
  }
  const { email, role, childIds } = parsed.data

  const { data, error } = await ctx.db.rpc('create_family_invitation', {
    p_email: email, p_role: role, p_child_ids: [...new Set(childIds)],
  })
  if (error) return rpcError(error, 'invitation.create')
  const row = (data as { invitation_id: string; token: string; expires_at: string }[] | null)?.[0]
  if (!row) return jsonError(500, 'db_error', 'L’invitation n’a pas pu être créée.')

  const emailStatus = await mailInvitation(ctx, {
    invitationId: row.invitation_id, email, role, token: row.token, expiresAt: row.expires_at, childIds, sendNumber: 1,
  })

  const body: IssuedInvitation = { id: row.invitation_id, email, role, token: row.token, expiresAt: row.expires_at, emailStatus }
  return jsonOk(body, 201)
}
