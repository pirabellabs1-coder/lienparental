/**
 * GET /api/coach/credits — soldes de l'utilisateur de la session et coût des actions IA actives.
 *
 * Sortie : { monthly, purchased, total, monthlyQuota, periodEnd, costs: { <action>: crédits },
 *            confirmFrom, packs: [{ id, credits, priceCents }] }
 * Sert à AFFICHER le coût avant une action (et demander confirmation si coût ≥ confirmFrom) : le
 * serveur reste l'autorité, la réservation est refaite et vérifiée à l'appel (jamais sur ce cache).
 * Aucun identifiant de lot ni donnée Stripe. 401 sans session · 503 base indisponible.
 */
import { getTranslations } from 'next-intl/server'
import { getCurrentUser } from '@/lib/auth/session'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { getCreditConfig } from '@/lib/ai/credit-config-server'
import { CONFIRM_COST_THRESHOLD, CREDIT_ACTIONS } from '@/lib/ai/credit-config'
import { getWallet } from '@/lib/ai/wallet'
import { packsFromConfig } from '@/lib/billing/credit-packs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const t = await getTranslations('ai.errors')
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthenticated', t('unauthenticated'))
  const rl = await rateLimit(userKey('coach-credits', user.id), 60, 60_000)
  if (!rl.ok) return jsonError(429, 'rate_limited', t('rateLimitedChat'), { 'Retry-After': String(rl.retryAfter) })
  try {
    const [{ config }, w] = await Promise.all([getCreditConfig(), getWallet(user)])
    const costs = Object.fromEntries(CREDIT_ACTIONS.filter((a) => config.actions[a].active).map((a) => [a, config.actions[a].cost]))
    return Response.json(
      {
        monthly: w.monthly, purchased: w.purchased, total: w.total, monthlyQuota: w.monthlyQuota, periodEnd: w.periodEnd,
        costs, confirmFrom: CONFIRM_COST_THRESHOLD, packs: packsFromConfig(config),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.warn('[credits] soldes indisponibles', err instanceof Error ? err.message : 'unknown')
    return jsonError(503, 'credits_unavailable', t('internal'))
  }
}
