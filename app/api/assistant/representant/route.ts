/**
 * GET /api/assistant/representant?service=info&lang=fr → { available } : un représentant du
 * service et de la langue est-il dans ses horaires et sans indisponibilité, maintenant ?
 */
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { HumanQuerySchema } from '@/lib/agent/schemas'
import { humanAvailable } from '@/lib/agent/server'
import { agentErrorResponse, limitIp } from '@/lib/agent/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const limited = await limitIp(req, 'agent-human', 30, 60_000)
  if (limited) return limited
  const q = HumanQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!q.success) return jsonError(422, 'invalid', 'Demande invalide.')
  try {
    return jsonOk({ available: await humanAvailable(q.data.service, q.data.lang) })
  } catch (e) {
    return agentErrorResponse(e, 'human')
  }
}
