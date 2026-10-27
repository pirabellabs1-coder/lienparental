import 'server-only'
import type { PlanId } from '@/components/profil/pricing'
import { getCurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { BILLING_LIVE } from './config'
import { DEMO_BILLING, getDemoBilling } from './demo'
import { demoBillingView } from './demo-core'
import { getEffectivePlan } from './entitlements'
import { getBillingOverview, mockBillingView } from './overview'
import { isOfferConfigured } from './prices'
import { getCustomerId, getSubscription, isUuid, syncSubscription } from './subscription'
import type { BillingView } from './types'
import { NONE_AVAILABLE, ALL_AVAILABLE, type Availability, type BillingMode } from './ui-state'

export type BillingPageState = {
  mode: BillingMode
  view: BillingView
  available: Availability
  /** Plan effectif (droits) : abonnement propre ou accès famille. */
  effective: PlanId
  signedIn: boolean
  /** Customer Stripe existant (ancien abonné inclus) : portail et factures restent accessibles. */
  hasCustomer: boolean
}

function availability(): Availability {
  return {
    premium: { mensuel: isOfferConfigured({ plan: 'premium', cycle: 'mensuel' }), annuel: isOfferConfigured({ plan: 'premium', cycle: 'annuel' }) },
    coparentalite: {
      mensuel: isOfferConfigured({ plan: 'coparentalite', cycle: 'mensuel' }),
      annuel: isOfferConfigured({ plan: 'coparentalite', cycle: 'annuel' }),
    },
  }
}

const FREE_VIEW: BillingView = { ...mockBillingView('gratuit'), card: null }

/**
 * État de l'écran « Mon abonnement », côté serveur.
 *  - live : base locale + Stripe. `resync` (retour du portail Stripe) relit
 *    l'abonnement chez Stripe et le reflète AVANT l'affichage (même code que le webhook).
 *  - demo : abonnement simulé (cookie).
 *  - unavailable : comptes réels, Stripe pas encore configuré.
 */
export async function loadBillingPage(opts: { resync?: boolean } = {}): Promise<BillingPageState> {
  if (DEMO_BILLING) {
    const demo = await getDemoBilling()
    const view = demo ? demoBillingView(demo) : { ...FREE_VIEW, live: false }
    return { mode: 'demo', view, available: ALL_AVAILABLE, effective: view.plan, signedIn: !!demo, hasCustomer: false }
  }

  const user = await getCurrentUser()
  if (!user || !isUuid(user.id)) {
    return { mode: BILLING_LIVE ? 'live' : 'unavailable', view: { ...FREE_VIEW, live: BILLING_LIVE }, available: BILLING_LIVE ? availability() : NONE_AVAILABLE, effective: 'gratuit', signedIn: false, hasCustomer: false }
  }

  if (!BILLING_LIVE) {
    // Supabase sans Stripe : aucun paiement possible, mais l'accès famille reste visible.
    const effective = SUPABASE_ENABLED ? await getEffectivePlan(user.id, 'gratuit') : { plan: 'gratuit' as const, via: null }
    return {
      mode: 'unavailable',
      view: { ...FREE_VIEW, live: true, sharedPremium: effective.via === 'famille' },
      available: NONE_AVAILABLE,
      effective: effective.plan,
      signedIn: true,
      hasCustomer: false,
    }
  }

  if (opts.resync) {
    try {
      const local = await getSubscription(user.id)
      if (local) await syncSubscription(local.stripe_subscription_id, user.id)
    } catch (err) {
      console.error('[billing] resynchronisation au retour du portail impossible', err instanceof Error ? err.message : 'unknown')
    }
  }

  const [overview, effective, customer] = await Promise.all([
    getBillingOverview(user.id),
    getEffectivePlan(user.id, 'gratuit'),
    getCustomerId(user.id).catch(() => null),
  ])
  return {
    mode: 'live',
    view: { ...overview, sharedPremium: overview.plan === 'gratuit' && effective.via === 'famille' },
    available: availability(),
    effective: effective.plan,
    signedIn: true,
    hasCustomer: !!customer,
  }
}
