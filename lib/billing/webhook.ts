import 'server-only'
import type Stripe from 'stripe'
import { planLabel } from '@/components/profil/pricing'
import {
  sendInvoiceReceiptEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionConfirmedEmail,
} from '@/lib/email/notify'
import { formatCents } from '@/lib/email/templates/format'
import { billingDb } from './db'
import { recordInvoice } from './payments'
import { offerFromPlan } from './prices'
import { idOf } from './stripe'
import { isBlockingStatus, isUuid, syncSubscription, type UpsertResult } from './subscription'

// --- Idempotence ----------------------------------------------------------

export type Claim = 'claimed' | 'done' | 'in_flight'
const STALE_CLAIM_MS = 2 * 60_000

/**
 * Réserve le traitement d'un événement (table stripe_events).
 *  - 'claimed'   : à traiter maintenant ;
 *  - 'done'      : déjà traité → 200 sans rien refaire ;
 *  - 'in_flight' : une autre livraison le traite → l'appelant renvoie 5xx, Stripe relivrera.
 */
export async function claimEvent(event: Stripe.Event): Promise<Claim> {
  const db = billingDb()
  const { error } = await db.from('stripe_events').insert({ id: event.id, type: event.type })
  if (!error) return 'claimed'
  if (error.code !== '23505') throw new Error(`stripe_events insert failed: ${error.code ?? 'unknown'}`)

  const { data } = await db.from('stripe_events').select('processed_at, received_at').eq('id', event.id).maybeSingle()
  const row = data as { processed_at: string | null; received_at: string } | null
  if (!row || row.processed_at) return 'done'
  if (Date.now() - Date.parse(row.received_at) < STALE_CLAIM_MS) return 'in_flight'

  // Réclamation abandonnée (crash) : reprise atomique (compare-and-set sur received_at).
  const { data: taken } = await db
    .from('stripe_events')
    .update({ received_at: new Date().toISOString() })
    .eq('id', event.id)
    .eq('received_at', row.received_at)
    .is('processed_at', null)
    .select('id')
  return taken && taken.length > 0 ? 'claimed' : 'in_flight'
}

export async function markProcessed(eventId: string): Promise<void> {
  await billingDb().from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId)
}

/** Échec de traitement : on libère la réclamation pour que le retry Stripe rejoue. */
export async function releaseClaim(eventId: string): Promise<void> {
  await billingDb().from('stripe_events').delete().eq('id', eventId).is('processed_at', null)
}

// --- Traitement -----------------------------------------------------------

/** Tâche différée (e-mail) exécutée après la réponse 200 à Stripe. */
export type Deferred = () => Promise<unknown>

type Recipient = { email: string; prenom: string }

async function recipient(userId: string): Promise<Recipient | null> {
  const { data } = await billingDb().from('users').select('email, prenom, deleted_at').eq('id', userId).maybeSingle()
  const row = data as { email: string | null; prenom: string | null; deleted_at: string | null } | null
  if (!row?.email || row.deleted_at) return null
  return { email: row.email, prenom: row.prenom ?? '' }
}

function logUnresolved(event: Stripe.Event, res: UpsertResult | null) {
  console.warn('[stripe-webhook] événement non rattaché', {
    id: event.id,
    type: event.type,
    reason: res && !res.ok ? res.reason : 'no_subscription',
  })
}

/**
 * Applique un événement Stripe. Toujours idempotent : l'état est relu chez
 * Stripe (pas le payload), les écritures sont des upserts, les e-mails portent
 * une clé d'idempotence dérivée de l'id d'événement.
 * Retourne les e-mails à envoyer après la réponse.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<Deferred[]> {
  const deferred: Deferred[] = []
  const key = (tpl: string) => `stripe:${event.id}:${tpl}`

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription') break
      const subId = idOf(session.subscription)
      const hint = isUuid(session.client_reference_id) ? session.client_reference_id : session.metadata?.user_id
      if (!subId) break
      const res = await syncSubscription(subId, hint)
      if (!res.ok) logUnresolved(event, res)
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const payload = event.data.object
      const res = await syncSubscription(payload.id)
      if (!res.ok) {
        logUnresolved(event, res)
        break
      }

      let kind: 'scheduled' | 'ended' | null = null
      // « Terminé » seulement si l'utilisateur a réellement eu Premium (pas pour un
      // Checkout abandonné qui expire en incomplete_expired).
      if (event.type === 'customer.subscription.deleted' && res.previous && res.previous.stripe_subscription_id === payload.id && isBlockingStatus(res.previous.status)) {
        kind = 'ended'
      }
      if (event.type === 'customer.subscription.updated') {
        const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>
        if ('cancel_at_period_end' in prev && prev.cancel_at_period_end === false && payload.cancel_at_period_end) {
          kind = 'scheduled'
        }
      }
      if (kind) {
        const k = kind
        const endIso = k === 'ended' ? new Date(event.created * 1000).toISOString() : res.record.current_period_end
        const to = await recipient(res.userId)
        if (to) {
          deferred.push(() =>
            sendSubscriptionCanceledEmail({ to: to.email, idempotencyKey: key(`canceled-${k}`) }, { prenom: to.prenom, kind: k, endIso }),
          )
        }
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      const subId = idOf(invoice.subscription)
      if (!subId) break // facture hors abonnement : non gérée en V1
      const res = await syncSubscription(subId)
      if (!res.ok) {
        logUnresolved(event, res)
        break
      }
      await recordInvoice(invoice, res.userId, 'succeeded')

      const to = await recipient(res.userId)
      if (!to) break
      const offer = offerFromPlan(res.record.plan)
      const cycle = offer.cycle
      const montant = formatCents(invoice.amount_paid, invoice.currency)
      const nextIso = res.record.current_period_end ?? new Date().toISOString()

      if (invoice.billing_reason === 'subscription_create') {
        deferred.push(() =>
          sendSubscriptionConfirmedEmail(
            { to: to.email, idempotencyKey: key('confirmed') },
            { prenom: to.prenom, formule: planLabel(offer.plan, cycle), montant, nextPaymentIso: nextIso, invoiceUrl: invoice.hosted_invoice_url },
          ),
        )
      } else if (invoice.billing_reason === 'subscription_cycle' && invoice.amount_paid > 0 && invoice.hosted_invoice_url) {
        const url = invoice.hosted_invoice_url
        deferred.push(() =>
          sendInvoiceReceiptEmail(
            { to: to.email, idempotencyKey: key('receipt') },
            { prenom: to.prenom, montant, cycle, nextPeriodEnd: nextIso, invoiceUrl: url },
          ),
        )
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subId = idOf(invoice.subscription)
      if (!subId) break
      // past_due → reste Premium pendant la grâce ; unpaid/canceled → retour en gratuit (CDC §6.1).
      const res = await syncSubscription(subId)
      if (!res.ok) {
        logUnresolved(event, res)
        break
      }
      await recordInvoice(invoice, res.userId, 'failed')

      // Un e-mail au premier échec, puis à la dernière tentative (pas à chaque relance).
      const last = !invoice.next_payment_attempt
      if (invoice.attempt_count <= 1 || last) {
        const to = await recipient(res.userId)
        if (to) {
          deferred.push(() =>
            sendPaymentFailedEmail(
              { to: to.email, idempotencyKey: key('payment-failed') },
              {
                prenom: to.prenom,
                montant: formatCents(invoice.amount_due, invoice.currency),
                nextAttemptIso: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
                invoiceUrl: invoice.hosted_invoice_url,
              },
            ),
          )
        }
      }
      break
    }

    default:
      break
  }

  return deferred
}
