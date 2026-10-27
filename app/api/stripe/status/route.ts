import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { syncFromCheckoutSession } from '@/lib/billing/checkout-return'
import { DEMO_BILLING, getDemoBilling } from '@/lib/billing/demo'
import { apiError, limitBilling, logError, requireBillingUser } from '@/lib/billing/http'
import { getSubscription, planOf } from '@/lib/billing/subscription'

/**
 * GET /api/stripe/status[?session_id=cs_…] : état de l'abonnement de l'utilisateur connecté.
 *
 * Avec `session_id` (retour de Stripe Checkout) : la session est relue chez Stripe,
 * son appartenance au compte est vérifiée, puis l'abonnement est synchronisé
 * immédiatement par le même code que le webhook (idempotent). L'écran de
 * confirmation interroge cette route jusqu'à `state: 'active'`.
 *  - 200 `{ state: 'active' | 'pending' | 'open' | 'expired' | 'none', plan, mode }`
 *  - 400 invalid_session · 401 · 404 session_not_found (inconnue ou d'un autre compte) · 429 · 503
 * Démonstration : état simulé (cookie lp_demo_billing), `mode: 'demo'`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const sessionParam = new URL(req.url).searchParams.get('session_id')

  if (DEMO_BILLING) {
    const demo = await getDemoBilling()
    if (!demo) return apiError(401, 'unauthenticated', 'Connexion requise.')
    return NextResponse.json({ mode: 'demo', state: demo.plan === 'gratuit' ? 'none' : 'active', plan: demo.plan }, { headers: NO_STORE })
  }

  const auth = await requireBillingUser()
  if ('error' in auth) return apiError(auth.error.status, auth.error.code, auth.error.message)
  const limited = await limitBilling('status', auth.user.id)
  if (limited) return limited

  try {
    if (sessionParam !== null) {
      const res = await syncFromCheckoutSession(auth.user.id, sessionParam)
      if (res.state === 'not_found') return apiError(404, 'session_not_found', 'Session de paiement introuvable.')
      if (res.state === 'active') revalidatePath('/app', 'layout')
      return NextResponse.json({ mode: 'live', state: res.state, plan: res.state === 'active' ? res.plan : 'gratuit' }, { headers: NO_STORE })
    }
    const local = await getSubscription(auth.user.id)
    const plan = planOf(local)
    return NextResponse.json({ mode: 'live', state: plan === 'gratuit' ? 'none' : 'active', plan }, { headers: NO_STORE })
  } catch (err) {
    logError('status', err)
    return apiError(503, 'stripe_unavailable', 'Statut momentanément indisponible.')
  }
}
