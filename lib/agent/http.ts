import 'server-only'
/** Routes publiques de l'agent d'accueil : garde commune (même origine, limiteur, erreurs). */
import { jsonError } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit, rateLimitedResponse } from '@/lib/data/server/rate-limit'
import { AgentError } from './server'

const MESSAGES: Record<AgentError['code'], [number, string]> = {
  not_found: [404, 'Introuvable.'],
  slot_taken: [409, 'Ce créneau vient d’être pris. Choisissez-en un autre.'],
  too_late: [409, 'Ce rendez-vous ne peut plus être modifié (moins de 2 heures avant).'],
  expired: [410, 'Le délai de confirmation (30 minutes) est dépassé : le créneau a été libéré. Reprenez rendez-vous depuis l’assistant.'],
  invalid: [422, 'Demande invalide.'],
  unavailable: [503, 'Service momentanément indisponible.'],
}

/** Plafond global (toutes IP), fail-closed : au-delà ou limiteur indisponible, refus. */
export async function limitGlobal(action: string, limit: number, windowMs: number): Promise<Response | null> {
  const rl = await rateLimit(`${action}:all`, limit, windowMs, { failClosed: true })
  return rl.ok ? null : rateLimitedResponse(rl)
}

/** Limiteur par IP ; renvoie une réponse 429/503 ou null. */
export async function limitIp(req: Request, action: string, limit: number, windowMs: number): Promise<Response | null> {
  const rl = await rateLimit(ipKey(action, clientIp(req.headers)), limit, windowMs)
  return rl.ok ? null : rateLimitedResponse(rl)
}

/** Corps JSON borné (8 Ko). */
export async function readSmallJson(req: Request): Promise<unknown> {
  const raw = await req.text().catch(() => '')
  if (raw.length > 8 * 1024) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function agentErrorResponse(e: unknown, scope: string): Response {
  if (e instanceof AgentError) {
    const [status, message] = MESSAGES[e.code]
    return jsonError(status, e.code, message)
  }
  console.warn(`[agent:${scope}] échec :`, e instanceof Error ? e.message : e)
  return jsonError(503, 'unavailable', MESSAGES.unavailable[1])
}
