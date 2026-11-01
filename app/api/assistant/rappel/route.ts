/**
 * POST /api/assistant/rappel — demande de rappel { lang, name, phone, reason, service? } → 201.
 * Même origine ; 5 par heure par IP ; 2 par jour par numéro ; plafond global quotidien fail-closed
 * (chaque demande envoie un e-mail à l'équipe).
 */
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, tokenKey } from '@/lib/data/server/rate-limit'
import { CallbackSchema } from '@/lib/agent/schemas'
import { requestCallback } from '@/lib/agent/server'
import { agentErrorResponse, limitGlobal, limitIp, readSmallJson } from '@/lib/agent/http'

const DAILY_CAP = Math.max(1, Number(process.env.AGENT_CALLBACKS_DAILY_CAP) || 60)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const limited = await limitIp(req, 'agent-callback', 5, 3_600_000)
  if (limited) return limited
  const body = CallbackSchema.safeParse(await readSmallJson(req))
  if (!body.success) return jsonError(422, 'invalid', 'Vérifiez les informations saisies.')
  if (body.data.website) return jsonOk({ ok: true }, 201)
  const perPhone = await rateLimit(tokenKey('agent-callback-phone', body.data.phone), 2, 86_400_000)
  if (!perPhone.ok) return rateLimitedResponse(perPhone)
  const global = await limitGlobal('agent-callback-global', DAILY_CAP, 86_400_000)
  if (global) return global
  try {
    await requestCallback({ name: body.data.name, phone: body.data.phone, reason: body.data.reason, service: body.data.service, language: body.data.lang, channel: 'web' })
    return jsonOk({ ok: true }, 201)
  } catch (e) {
    return agentErrorResponse(e, 'callback')
  }
}
