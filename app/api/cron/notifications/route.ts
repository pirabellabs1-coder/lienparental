/**
 * GET | POST /api/cron/notifications
 * Tâche planifiée (toutes les 5 min, vercel.json) : rappels du calendrier arrivés à
 * échéance, livraison de la file public.notification_jobs (e-mails groupés des
 * messages non lus, etc.), purge des tâches de plus de 30 jours. Voir docs/NOTIFICATIONS.md.
 *
 * Authentification : `Authorization: Bearer <CRON_SECRET>` (envoyé par Vercel Cron).
 *   200 { status: 'processed', ...rapport } | { status: 'skipped' } (démo / service_role absent)
 *   401 secret absent ou faux · 503 CRON_SECRET non défini · 500 échec global (repris au passage suivant).
 */
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { cronUnauthorized } from '@/lib/data/server/cron-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { runNotificationsCron } from '@/lib/notify/jobs'
import { runAgentCron } from '@/lib/agent/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(req: Request) {
  const denied = cronUnauthorized(req)
  if (denied) return denied
  if (!SUPABASE_ENABLED) return jsonOk({ status: 'skipped' })
  try {
    const report = await runNotificationsCron()
    // Agent d'accueil (0640) : rappels de rendez-vous 24 h / 2 h et conservation ; une panne ici
    // n'empêche pas les notifications.
    const agent = await runAgentCron().catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'agent' }))
    if (!report) return jsonOk({ status: 'skipped', agent })
    return jsonOk({ status: 'processed', ...report, agent })
  } catch {
    return jsonError(500, 'cron_failed', 'Traitement interrompu. Il sera repris au prochain passage.')
  }
}

export const GET = handle
export const POST = handle
