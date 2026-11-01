/**
 * GET /api/assistant/creneaux?type=decouverte&lang=fr[&after=ISO] — 3 prochains créneaux libres
 * (un par jour, heure de Cayenne). Aucune donnée de représentant n'est renvoyée.
 */
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { SlotsQuerySchema } from '@/lib/agent/schemas'
import { listSlots } from '@/lib/agent/server'
import { agentErrorResponse, limitIp } from '@/lib/agent/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const limited = await limitIp(req, 'agent-slots', 30, 60_000)
  if (limited) return limited
  const q = SlotsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!q.success) return jsonError(422, 'invalid', 'Demande invalide.')
  try {
    return jsonOk({ slots: await listSlots(q.data.type, q.data.lang, q.data.after) })
  } catch (e) {
    return agentErrorResponse(e, 'slots')
  }
}
