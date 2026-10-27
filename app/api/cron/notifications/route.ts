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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(req: Request) {
  const denied = cronUnauthorized(req)
  if (denied) return denied
  if (!SUPABASE_ENABLED) return jsonOk({ status: 'skipped' })
  try {
    const report = await runNotificationsCron()
    if (!report) return jsonOk({ status: 'skipped' })
    return jsonOk({ status: 'processed', ...report })
  } catch {
    return jsonError(500, 'cron_failed', 'Traitement interrompu. Il sera repris au prochain passage.')
  }
}

export const GET = handle
export const POST = handle
