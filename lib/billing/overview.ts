import 'server-only'
import type Stripe from 'stripe'
import { subscription as mockSubscription } from '@/components/profil/data'
import { priceForPlan, type Cycle, type Offer, type PaidPlan, type PlanId } from '@/components/profil/pricing'
import { BILLING_LIVE } from './config'
import { sameOffer } from './plans'
import { offerFromPlan, offerFromPrice, offerFromPriceId } from './prices'
import { getStripe, idOf } from './stripe'
import { getCustomerId, getSubscription, planOf } from './subscription'
import type { BillingCard, BillingView, InvoiceItem, InvoicesResponse } from './types'

/** Lien de paiement Stripe d'une facture encore à régler (premier paiement non abouti, échec). */
function payUrlOf(inv: string | Stripe.Invoice | null | undefined): string | null {
  if (!inv || typeof inv === 'string' || inv.status !== 'open' || !inv.hosted_invoice_url) return null
  try {
    const u = new URL(inv.hosted_invoice_url)
    return u.protocol === 'https:' && u.hostname.endsWith('stripe.com') ? u.toString() : null
  } catch {
    return null
  }
}

function cardOf(pm: string | Stripe.PaymentMethod | null | undefined): BillingCard | null {
  if (!pm || typeof pm === 'string') return null
  if (pm.card) return { brand: pm.card.brand, last4: pm.card.last4 }
  if (pm.sepa_debit?.last4) return { brand: 'SEPA', last4: pm.sepa_debit.last4 }
  return null
}

/**
 * Aperçu de démonstration (aucune clé) : même forme que l'aperçu réel.
 * `plan` : niveau simulé ; `cycle` : cycle simulé (défaut : celui des données de démo).
 */
export function mockBillingView(plan: PlanId, cycle: Cycle = mockSubscription.cycle): BillingView {
  const paid = plan !== 'gratuit'
  const formule: PaidPlan = plan === 'coparentalite' ? 'coparentalite' : 'premium'
  return {
    live: false,
    plan,
    status: paid ? 'active' : null,
    formule,
    cycle,
    amount: priceForPlan(formule, cycle),
    periodEnd: null,
    cancelAtPeriodEnd: false,
    trialEnd: null,
    payUrl: null,
    card: paid ? { brand: mockSubscription.card.brand, last4: mockSubscription.card.last4 } : null,
    pending: null,
    sharedPremium: false,
  }
}

/**
 * Aperçu réel de l'abonnement : base locale (statut, dates) + Stripe
 * (moyen de paiement par défaut, montant, changement programmé).
 * Si Stripe est indisponible, on dégrade proprement sur la base locale.
 */
export async function getBillingOverview(userId: string): Promise<BillingView> {
  const local = BILLING_LIVE ? await getSubscription(userId) : null
  const localOffer: Offer = local ? offerFromPlan(local.plan) : { plan: 'premium', cycle: 'mensuel' }
  const base: BillingView = {
    live: true,
    plan: planOf(local),
    status: local?.status ?? null,
    formule: localOffer.plan,
    cycle: localOffer.cycle,
    amount: local ? priceForPlan(localOffer.plan, localOffer.cycle) : null,
    periodEnd: local?.current_period_end ?? null,
    cancelAtPeriodEnd: local?.cancel_at_period_end ?? false,
    trialEnd: local?.trial_end ?? null,
    payUrl: null,
    card: null,
    pending: null,
    sharedPremium: false,
  }
  if (!local || local.status === 'canceled' || local.status === 'incomplete_expired') return base

  try {
    const sub = await getStripe().subscriptions.retrieve(local.stripe_subscription_id, {
      expand: ['default_payment_method', 'customer.invoice_settings.default_payment_method', 'schedule', 'latest_invoice'],
    })
    const price = sub.items.data[0]?.price
    const customer = typeof sub.customer === 'object' && !('deleted' in sub.customer && sub.customer.deleted)
      ? (sub.customer as Stripe.Customer)
      : null
    const card = cardOf(sub.default_payment_method) ?? cardOf(customer?.invoice_settings?.default_payment_method)

    const current = offerFromPrice(price) ?? localOffer
    let pending: Offer | null = null
    const schedule = typeof sub.schedule === 'object' ? sub.schedule : null
    if (schedule && schedule.status === 'active') {
      const now = Math.floor(Date.now() / 1000)
      const next = schedule.phases.find(p => p.start_date > now)
      const nextPrice = next?.items[0]?.price
      const nextPriceId = idOf(nextPrice as string | { id: string } | null | undefined)
      if (nextPriceId && nextPriceId !== price?.id) {
        const offer = offerFromPriceId(nextPriceId)
        if (offer && !sameOffer(offer, current)) pending = offer
      }
    }

    return {
      ...base,
      // Le niveau suit le Price lu chez Stripe (montée appliquée avant l'arrivée du webhook).
      plan: base.plan === 'gratuit' ? 'gratuit' : current.plan,
      formule: current.plan,
      cycle: current.cycle,
      amount: typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : base.amount,
      periodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      payUrl: payUrlOf(sub.latest_invoice),
      card,
      pending,
    }
  } catch (err) {
    console.error('[billing] overview Stripe indisponible', err instanceof Error ? err.message : 'unknown')
    return base
  }
}

const INVOICE_STATUSES = new Set(['paid', 'open', 'void', 'uncollectible', 'draft'])

/** Factures Stripe de l'utilisateur (pagination par curseur Stripe). */
export async function listInvoices(
  userId: string,
  opts: { limit: number; startingAfter?: string | null },
): Promise<InvoicesResponse> {
  const customerId = await getCustomerId(userId)
  if (!customerId) return { data: [], page: { next_cursor: null, has_more: false } }

  const res = await getStripe().invoices.list({
    customer: customerId,
    limit: opts.limit,
    ...(opts.startingAfter ? { starting_after: opts.startingAfter } : {}),
  })

  const data: InvoiceItem[] = res.data
    .filter(inv => inv.id && inv.status !== 'draft')
    .map(inv => ({
      id: inv.id as string,
      number: inv.number,
      date: new Date(inv.created * 1000).toISOString(),
      amount_cents: inv.status === 'paid' ? inv.amount_paid : inv.amount_due,
      currency: inv.currency.toUpperCase(),
      status: (INVOICE_STATUSES.has(inv.status ?? '') ? inv.status : 'open') as InvoiceItem['status'],
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,
    }))

  const last = res.data[res.data.length - 1]
  return { data, page: { next_cursor: res.has_more && last?.id ? last.id : null, has_more: res.has_more } }
}
