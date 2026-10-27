import 'server-only'
/**
 * Authentification des tâches planifiées (Vercel Cron) : en-tête
 * `Authorization: Bearer <CRON_SECRET>`, comparé en temps constant.
 * Même règle que /api/integrations/google/calendar/cron.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { jsonError } from './http'

const MIN_SECRET_LENGTH = 16

function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) && given.length === expected.length
}

/** null si autorisé, sinon la réponse d'erreur (503 non configuré, 401 secret absent ou faux). */
export function cronUnauthorized(req: Request): Response | null {
  const expected = process.env.CRON_SECRET?.trim() ?? ''
  if (expected.length < MIN_SECRET_LENGTH) return jsonError(503, 'not_configured', 'Tâche planifiée non configurée.')
  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!given || !sameSecret(given, expected)) return jsonError(401, 'unauthorized', 'Non autorisé.')
  return null
}
