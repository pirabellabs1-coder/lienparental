import 'server-only'
import type Stripe from 'stripe'
import type { Cycle, Offer } from '@/components/profil/pricing'
import { appOrigin } from './config'
import { planDirection } from './plans'
import { offerFromPrice, priceIdForOffer } from './prices'
import { getStripe, idOf } from './stripe'
import { getCustomerId, getSubscription, upsertFromStripe } from './subscription'

export type ManageError = { ok: false; status: number; code: string; message: string }
const err = (status: number, code: string, message: string): ManageError => ({ ok: false, status, code, message })

/**
 * Abonnement Stripe de l'utilisateur, relu chez Stripe et vérifié : il doit
 * appartenir au customer enregistré pour cet utilisateur (défense en profondeur).
 */
async function loadOwnedSubscription(userId: string): Promise<{ ok: true; sub: Stripe.Subscription } | ManageError> {
  const local = await getSubscription(userId)
  if (!local || local.status === 'canceled' || local.status === 'incomplete_expired') {
    return err(409, 'no_subscription', 'Aucun abonnement en cours.')
  }
  const sub = await getStripe().subscriptions.retrieve(local.stripe_subscription_id)
  if (idOf(sub.customer) !== local.stripe_customer_id) {
    console.error('[billing] incohérence customer/abonnement', { sub: sub.id })
    return err(409, 'no_subscription', 'Aucun abonnement en cours.')
  }
  return { ok: true, sub }
}

export type ChangePlanStatus = 'unchanged' | 'pending_change_canceled' | 'scheduled' | 'upgraded' | 'downgraded'

export type ChangePlanResult =
  | { ok: true; status: ChangePlanStatus; offer: Offer; cycle: Cycle; effective_at: string | null }
  | ManageError

/** Erreur Stripe de paiement (carte refusée, 3-D Secure requis) lors d'un changement immédiat. */
function isPaymentError(e: unknown): boolean {
  const x = e as { type?: string; statusCode?: number } | null
  return !!x && (x.type === 'StripeCardError' || x.statusCode === 402)
}

/**
 * Changement de formule.
 *  - Même niveau, autre cycle (mensuel ↔ annuel) : AU PROCHAIN CYCLE, sans
 *    prorata (subscription schedule à deux phases, libéré ensuite).
 *  - Montée (Premium → Coparentalité+) : IMMÉDIATE, prorata facturé et prélevé
 *    tout de suite (`always_invoice`). `error_if_incomplete` : si le paiement
 *    échoue (refus, 3-D Secure), Stripe n'applique RIEN et on renvoie 402.
 *  - Descente (Coparentalité+ → Premium) : IMMÉDIATE, crédit au prorata du
 *    temps non consommé déduit des prochaines factures (`create_prorations`).
 * Choisir à nouveau la formule actuelle annule un changement programmé.
 * Les montants viennent exclusivement des Price IDs Stripe (jamais du client).
 */
export async function changePlan(userId: string, offer: Offer): Promise<ChangePlanResult> {
  const target = priceIdForOffer(offer)
  if (!target) return err(503, 'misconfigured', 'Service momentanément indisponible.')

  const owned = await loadOwnedSubscription(userId)
  if (!owned.ok) return owned
  const { sub } = owned
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return err(409, 'subscription_not_active', 'Régularisez d’abord votre paiement pour changer de formule.')
  }
  if (sub.cancel_at_period_end) {
    return err(409, 'cancel_pending', 'Annulez d’abord la résiliation pour changer de formule.')
  }

  const stripe = getStripe()
  const item = sub.items.data[0]
  const currentPrice = item?.price.id
  const scheduleId = idOf(sub.schedule)
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
  const done = (status: ChangePlanStatus, effective_at: string | null): ChangePlanResult =>
    ({ ok: true, status, offer, cycle: offer.cycle, effective_at })

  if (target === currentPrice) {
    if (scheduleId) {
      await stripe.subscriptionSchedules.release(scheduleId)
      return done('pending_change_canceled', null)
    }
    return done('unchanged', null)
  }
  if (!item || !currentPrice) return err(409, 'no_subscription', 'Aucun abonnement en cours.')

  const direction = planDirection(offerFromPrice(item.price).plan, offer.plan)
  const metadata = { user_id: userId }

  // --- Montée / descente de niveau : immédiate, avec prorata -----------------
  if (direction !== 'same') {
    // Un changement de cycle programmé est remplacé par le changement immédiat.
    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId)
    try {
      const updated = await stripe.subscriptions.update(
        sub.id,
        {
          items: [{ id: item.id, price: target, quantity: 1 }],
          proration_behavior: direction === 'upgrade' ? 'always_invoice' : 'create_prorations',
          payment_behavior: 'error_if_incomplete',
          metadata,
        },
        // Double clic / relance réseau : un seul changement, une seule facture de prorata.
        { idempotencyKey: `change-plan:${sub.id}:${currentPrice}:${target}:${sub.current_period_start}` },
      )
      // Reflet immédiat (droits, users.plan) ; le webhook customer.subscription.updated confirmera.
      await upsertFromStripe(updated, userId)
    } catch (e) {
      if (isPaymentError(e)) {
        return err(402, 'payment_failed', 'Le paiement de la différence a été refusé. Vérifiez votre moyen de paiement puis réessayez.')
      }
      throw e
    }
    return done(direction === 'upgrade' ? 'upgraded' : 'downgraded', new Date().toISOString())
  }

  // --- Même niveau, autre cycle : au prochain cycle, sans prorata -----------
  const schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create({ from_subscription: sub.id })

  const startDate = schedule.current_phase?.start_date ?? sub.current_period_start
  const endDate = schedule.current_phase?.end_date ?? sub.current_period_end

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    proration_behavior: 'none',
    metadata,
    phases: [
      {
        items: [{ price: currentPrice, quantity: 1 }],
        start_date: startDate,
        end_date: endDate,
        proration_behavior: 'none',
        metadata,
      },
      {
        items: [{ price: target, quantity: 1 }],
        iterations: 1,
        proration_behavior: 'none',
        metadata,
      },
    ],
  })

  return done('scheduled', periodEnd)
}

export type CancelResult =
  | { ok: true; cancel_at_period_end: boolean; current_period_end: string }
  | ManageError

/**
 * Résiliation en fin de période (cancel=true) ou annulation de la résiliation
 * (cancel=false). Un changement de formule programmé est abandonné à la
 * résiliation (un abonnement piloté par un schedule ne peut pas être résilié directement).
 */
export async function setCancelAtPeriodEnd(userId: string, cancel: boolean): Promise<CancelResult> {
  const owned = await loadOwnedSubscription(userId)
  if (!owned.ok) return owned
  const { sub } = owned

  const stripe = getStripe()
  if (sub.cancel_at_period_end === cancel) {
    return { ok: true, cancel_at_period_end: cancel, current_period_end: new Date(sub.current_period_end * 1000).toISOString() }
  }
  const scheduleId = idOf(sub.schedule)
  if (cancel && scheduleId) await stripe.subscriptionSchedules.release(scheduleId)

  const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: cancel })
  // Reflet immédiat pour l'UI ; le webhook customer.subscription.updated confirmera (idempotent).
  await upsertFromStripe(updated, userId)
  return {
    ok: true,
    cancel_at_period_end: updated.cancel_at_period_end,
    current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
  }
}

export type CancelNowResult = { ok: true; canceled: boolean } | ManageError

/**
 * Résiliation IMMÉDIATE (suppression de compte) : aucune facture de prorata, aucun
 * renouvellement. Sans abonnement en cours : succès sans action (idempotent).
 * Un subscription schedule éventuel est libéré d'abord (sinon Stripe le réactiverait).
 */
export async function cancelSubscriptionNow(userId: string): Promise<CancelNowResult> {
  const owned = await loadOwnedSubscription(userId)
  if (!owned.ok) return owned.code === 'no_subscription' ? { ok: true, canceled: false } : owned
  const { sub } = owned
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return { ok: true, canceled: false }

  const stripe = getStripe()
  const scheduleId = idOf(sub.schedule)
  if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId)

  const canceled = await stripe.subscriptions.cancel(
    sub.id,
    { invoice_now: false, prorate: false, cancellation_details: { comment: 'account_deleted' } },
    { idempotencyKey: `account-delete-cancel:${sub.id}` },
  )
  // Reflet local immédiat ; le webhook customer.subscription.deleted confirmera (idempotent).
  await upsertFromStripe(canceled, userId)
  return { ok: true, canceled: true }
}

/** URL d'une session du portail client Stripe (moyen de paiement, factures, adresse). */
export async function createPortalUrl(userId: string): Promise<{ ok: true; url: string } | ManageError> {
  const base = appOrigin()
  if (!base) return err(500, 'misconfigured', 'Service momentanément indisponible.')
  const customer = await getCustomerId(userId)
  if (!customer) return err(409, 'no_customer', 'Aucun moyen de paiement enregistré pour ce compte.')

  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${base}/app/profil/abonnement`,
    locale: 'fr',
    ...(configuration && configuration.startsWith('bpc_') ? { configuration } : {}),
  })
  return { ok: true, url: session.url }
}
