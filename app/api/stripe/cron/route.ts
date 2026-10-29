/**
 * GET | POST /api/stripe/cron : tâche planifiée QUOTIDIENNE (vercel.json).
 * Fait respecter le délai de grâce des paiements en échec dans le temps : les
 * abonnements past_due / unpaid (et les actifs dont la période est dépassée, webhook
 * manqué) sont resynchronisés ; au-delà de BILLING_GRACE_DAYS, users.plan repasse
 * à Gratuit. Côté Stripe, régler les relances (Billing > Revenue recovery > Retries) sur
 * « Annuler l'abonnement » après le dernier échec : voir docs/STRIPE.md.
 *
 * Crédits IA (0520) : restitue aussi les réservations échues (opération non livrée, instance
 * arrêtée) ; chaque compte les restitue déjà de lui-même à sa prochaine action.
 *
 * Authentification : `Authorization: Bearer <CRON_SECRET>` (Vercel Cron).
 *   200 { status: 'processed', checked, synced, downgraded, errors, creditsReleased } | { status: 'skipped' }
 *   401 · 503 CRON_SECRET non défini · 500 échec global (repris le lendemain).
 */
import { revalidatePath } from 'next/cache'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { cronUnauthorized } from '@/lib/data/server/cron-auth'
import { BILLING_LIVE } from '@/lib/billing/config'
import { enforceBillingGrace } from '@/lib/billing/subscription'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { sweepCredits } from '@/lib/ai/wallet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(req: Request) {
  const denied = cronUnauthorized(req)
  if (denied) return denied
  const creditsReleased = SUPABASE_ENABLED
    ? await sweepCredits().catch((err) => {
        console.error('[credits] restitution planifiée interrompue', err instanceof Error ? err.message : 'unknown')
        return -1
      })
    : 0
  if (!BILLING_LIVE) return jsonOk({ status: 'skipped', creditsReleased })
  try {
    const report = await enforceBillingGrace()
    if (report.downgraded > 0) revalidatePath('/app', 'layout')
    return jsonOk({ status: 'processed', ...report, creditsReleased })
  } catch (err) {
    console.error('[billing] cron grâce interrompu', err instanceof Error ? err.message : 'unknown')
    return jsonError(500, 'cron_failed', 'Traitement interrompu. Il sera repris au prochain passage.')
  }
}

export const GET = handle
export const POST = handle
