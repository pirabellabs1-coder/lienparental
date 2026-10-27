import 'server-only'
import type Stripe from 'stripe'
import type { Offer } from '@/components/profil/pricing'
import { appOrigin } from './config'
import { changePlanCore, type ChangeResult, type SubState } from './change-core'
import { offerFromPriceId, priceIdForOffer } from './prices'
import { getStripe, idOf } from './stripe'
import { getCustomerId, getSubscription, syncSubscription } from './subscription'

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

export type { ChangePlanStatus } from './change-core'
export type ChangePlanResult = ChangeResult

/** Instantané utile au changement de formule, relu chez Stripe. */
function stateOf(sub: Stripe.Subscription): SubState {
  const item = sub.items.data[0]
  return {
    id: sub.id,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: sub.current_period_end,
    schedule: idOf(sub.schedule),
    latest_invoice: idOf(sub.latest_invoice),
    item: item ? { id: item.id, price: item.price.id } : null,
  }
}

/**
 * Programme `nextPrice` à la prochaine échéance : subscription schedule à deux
 * phases (période en cours inchangée, puis une itération au nouveau Price), libéré ensuite.
 */
async function scheduleNext(sub: SubState, currentPrice: string, nextPrice: string, userId: string): Promise<void> {
  const stripe = getStripe()
  const metadata = { user_id: userId }
  const schedule = sub.schedule
    ? await stripe.subscriptionSchedules.retrieve(sub.schedule)
    : await stripe.subscriptionSchedules.create({ from_subscription: sub.id })
  const startDate = schedule.current_phase?.start_date
  const endDate = schedule.current_phase?.end_date ?? sub.current_period_end
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    proration_behavior: 'none',
    metadata,
    phases: [
      { items: [{ price: currentPrice, quantity: 1 }], ...(startDate ? { start_date: startDate } : {}), end_date: endDate, proration_behavior: 'none', metadata },
      { items: [{ price: nextPrice, quantity: 1 }], iterations: 1, proration_behavior: 'none', metadata },
    ],
  })
}

/**
 * Changement de formule (règles : lib/billing/change-core.ts). `requestId` : UUID
 * propre à chaque clic (clé d'idempotence Stripe). Les montants viennent
 * exclusivement des Price IDs Stripe (jamais du client).
 */
export async function changePlan(userId: string, offer: Offer, requestId: string): Promise<ChangePlanResult> {
  const owned = await loadOwnedSubscription(userId)
  if (!owned.ok) return owned
  const stripe = getStripe()
  return changePlanCore(
    {
      priceIdForOffer,
      offerFromPriceId,
      retrieve: async id => stateOf(await stripe.subscriptions.retrieve(id)),
      updatePrice: async (sub, price, proration, idempotencyKey) => {
        if (!sub.item) throw new Error('no_item')
        await stripe.subscriptions.update(
          sub.id,
          {
            items: [{ id: sub.item.id, price, quantity: 1 }],
            proration_behavior: proration,
            // Si le paiement de la différence échoue (refus, 3-D Secure), Stripe n'applique RIEN.
            payment_behavior: 'error_if_incomplete',
            metadata: { user_id: userId },
          },
          { idempotencyKey },
        )
      },
      releaseSchedule: async id => { await stripe.subscriptionSchedules.release(id) },
      scheduleNext: (sub, currentPrice, nextPrice) => scheduleNext(sub, currentPrice, nextPrice, userId),
      sync: id => syncSubscription(id, userId),
    },
    owned.sub.id,
    offer,
    requestId,
  )
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

  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: cancel })
  // Reflet immédiat, depuis une relecture Stripe (jamais l'objet renvoyé) ; le webhook confirmera.
  await syncSubscription(sub.id, userId)
  const updated = await stripe.subscriptions.retrieve(sub.id)
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

  await stripe.subscriptions.cancel(
    sub.id,
    { invoice_now: false, prorate: false, cancellation_details: { comment: 'account_deleted' } },
    { idempotencyKey: `account-delete-cancel:${sub.id}` },
  )
  // Reflet local immédiat (relecture Stripe) ; le webhook customer.subscription.deleted confirmera.
  await syncSubscription(sub.id, userId)
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
    // Au retour, « Mon abonnement » resynchronise l'abonnement (changements faits dans le portail).
    return_url: `${base}/app/abonnement?info=portal`,
    locale: 'fr',
    ...(configuration && configuration.startsWith('bpc_') ? { configuration } : {}),
  })
  return { ok: true, url: session.url }
}
