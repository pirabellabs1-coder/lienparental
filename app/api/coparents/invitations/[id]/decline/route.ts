import { getTranslations } from 'next-intl/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, rpcError } from '@/lib/coparents/server/context'
import { uuidSchema } from '@/lib/coparents/validation'

// POST /api/coparents/invitations/[id]/decline : refuse une demande reçue (e-mail vérifié).
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const t = await getTranslations('server.coparents')
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return jsonError(404, 'not_found', t('requestNotFound'))
  const tooMany = await limited(ctx.user.id, 'write', 60, 60_000)
  if (tooMany) return tooMany

  const { error } = await ctx.db.rpc('decline_family_invitation', { p_invitation_id: id })
  if (error) return rpcError(error, 'invitation.decline', t('requestNotFoundOrHandled'))
  return jsonOk({ ok: true })
}
