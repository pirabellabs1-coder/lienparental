/**
 * GET /api/assistant/agent?lang=fr|en|pt — configuration publique du widget : textes par défaut
 * (back-office, sinon cahier V2), types de rendez-vous actifs, adresse e-mail de contact.
 */
import { jsonOk } from '@/lib/data/server/http'
import { AgentLocaleSchema } from '@/lib/agent/schemas'
import { publicConfig } from '@/lib/agent/server'
import { agentErrorResponse, limitIp } from '@/lib/agent/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const limited = await limitIp(req, 'agent-config', 60, 60_000)
  if (limited) return limited
  const lang = AgentLocaleSchema.catch('fr').parse(new URL(req.url).searchParams.get('lang'))
  try {
    return jsonOk(await publicConfig(lang))
  } catch (e) {
    return agentErrorResponse(e, 'config')
  }
}
