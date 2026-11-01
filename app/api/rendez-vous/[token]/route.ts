/**
 * GET  /api/rendez-vous/[token] → rendez-vous (référence, date, motif, modifiable ?)
 * POST /api/rendez-vous/[token] { action: 'confirm' } (lien de l'e-mail, 30 min) | { action: 'cancel' } |
 *   { action: 'reschedule', start } — modification jusqu'à 2 h avant ; le même lien reste valable.
 * Le jeton (lien de l'e-mail de confirmation) n'est conservé qu'en empreinte ; limiteur par jeton et IP.
 */
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, tokenKey } from '@/lib/data/server/rate-limit'
import { ManageSchema } from '@/lib/agent/schemas'
import { cancelByToken, confirmByToken, rescheduleByToken, viewByToken } from '@/lib/agent/server'
import { agentErrorResponse, limitIp, readSmallJson } from '@/lib/agent/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const limited = await limitIp(req, 'agent-manage', 30, 60_000)
  if (limited) return limited
  const { token } = await params
  try {
    return jsonOk(await viewByToken(token))
  } catch (e) {
    return agentErrorResponse(e, 'manage-view')
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const limited = await limitIp(req, 'agent-manage-write', 10, 3_600_000)
  if (limited) return limited
  const { token } = await params
  const perToken = await rateLimit(tokenKey('agent-manage-token', token), 10, 3_600_000)
  if (!perToken.ok) return rateLimitedResponse(perToken)
  const body = ManageSchema.safeParse(await readSmallJson(req))
  if (!body.success) return jsonError(422, 'invalid', 'Demande invalide.')
  try {
    if (body.data.action === 'confirm') {
      const b = await confirmByToken(token)
      return jsonOk({ status: 'confirmed', ref: b.ref, start: b.start, emailSent: b.emailSent })
    }
    if (body.data.action === 'cancel') {
      await cancelByToken(token)
      return jsonOk({ status: 'cancelled' })
    }
    const b = await rescheduleByToken(token, body.data.start)
    return jsonOk({ status: 'changed', ref: b.ref, start: b.start, date: b.date, time: b.time, emailSent: b.emailSent })
  } catch (e) {
    return agentErrorResponse(e, 'manage')
  }
}
