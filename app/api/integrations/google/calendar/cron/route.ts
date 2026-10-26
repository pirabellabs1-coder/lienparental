/**
 * GET | POST /api/integrations/google/calendar/cron
 * Tâche planifiée (toutes les 5 min) : écoule la file de réessai Google Agenda de TOUS les
 * utilisateurs, par lots bornés (lib/integrations/google/cron.ts).
 *
 * Authentification : en-tête `Authorization: Bearer <CRON_SECRET>` (format envoyé par
 * Vercel Cron ; pg_cron + pg_net l'envoient explicitement), comparé en temps constant.
 * Aucune session utilisateur. Réponses :
 *   200 { status: 'processed', ...rapport } | { status: 'skipped' } (intégration non configurée)
 *   401 secret absent ou faux · 503 CRON_SECRET non défini sur le serveur · 500 échec global.
 * Voir docs/MISE_EN_SERVICE.md §5.4 bis.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { googleCalendarConfigured } from '@/lib/integrations/google/config'
import { runGoogleQueueCron } from '@/lib/integrations/google/cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Le traitement s'arrête de lui-même après ~40 s (budget de cron.ts).
export const maxDuration = 60

const MIN_SECRET_LENGTH = 16

/** Comparaison en temps constant, y compris quand les longueurs diffèrent (empreintes de taille fixe). */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) && given.length === expected.length
}

async function handle(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim() ?? ''
  if (expected.length < MIN_SECRET_LENGTH) return jsonError(503, 'not_configured', 'Tâche planifiée non configurée.')

  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!given || !sameSecret(given, expected)) return jsonError(401, 'unauthorized', 'Non autorisé.')

  // Intégration absente (démo, variables Google manquantes) : rien à faire, réponse neutre.
  if (!googleCalendarConfigured()) return jsonOk({ status: 'skipped' })

  try {
    const report = await runGoogleQueueCron()
    return jsonOk({ status: 'processed', ...report })
  } catch {
    return jsonError(500, 'cron_failed', 'Traitement de la file interrompu. Il sera repris au prochain passage.')
  }
}

export const GET = handle
export const POST = handle
