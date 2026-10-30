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
import { getStripe } from './stripe'
import { invoiceSubscriptionId } from './events'
import { claimEventWith, type Claim, type EventStore } from './claim-core'
import { idOf } from './stripe'
import { isUuid, syncSubscription, type UpsertResult } from './subscription'
import { grantCreditsForSession } from '@/lib/ai/credits'
import { revokeCreditsForPayment } from '@/lib/ai/wallet'
import { isCreditSession } from '@/lib/ai/credits-core'
import { isStorageSession } from './storage-packs'
import { grantStorageForSession, revokeStorageForPayment } from './storage'

// --- Idempotence ----------------------------------------------------------

export type { Claim } from './claim-core'

const eventStore: EventStore = {
  async insert(id, type) {
    const { error } = await billingDb().from('stripe_events').insert({ id, type })
    if (!error) return 'ok'
    if (error.code === '23505') return 'duplicate'
    throw new Error(`stripe_events insert failed: ${error.code ?? 'unknown'}`)
  },
  async get(id) {
    const { data } = await billingDb().from('stripe_events').select('processed_at, received_at').eq('id', id).maybeSingle()
    return (data as { processed_at: string | null; received_at: string } | null) ?? null
  },
  async takeOver(id, expected, nowIso) {
    const { data } = await billingDb()
      .from('stripe_events')
      .update({ received_at: nowIso })
      .eq('id', id)
      .eq('received_at', expected)
      .is('processed_at', null)
      .select('id')
    return !!data && data.length > 0
  },
}

/** Réserve le traitement d'un événement (voir lib/billing/claim-core.ts). */
export function claimEvent(event: Stripe.Event): Promise<Claim> {
  return claimEventWith(eventStore, event)
}

export async function markProcessed(eventId: string): Promise<void> {
  const { error } = await billingDb().from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId)
  // Échec : l'appelant renvoie 500, Stripe relivre ; le retraitement est idempotent.
  if (error) throw new Error(`stripe_events update failed: ${error.code ?? 'unknown'}`)
}

/** Échec de traitement : on libère la réclamation pour que le retry Stripe rejoue. */
export async function releaseClaim(eventId: string): Promise<void> {
  await billingDb().from('stripe_events').delete().eq('id', eventId).is('processed_at', null)
}

// --- Traitement -----------------------------------------------------------

/** Relit une facture chez Stripe (forme garantie par la version d'API du client). */
async function retrieveInvoice(payload: { id?: string | null }): Promise<Stripe.Invoice> {
  if (!payload.id) throw new Error('invoice without id')
  return getStripe().invoices.retrieve(payload.id)
}

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
      // Achat de crédits IA (paiement unique) : session relue chez Stripe, crédit idempotent par
      // session (grant_ai_credits + écriture « purchase » au journal, 0520). Aucun effet sur
      // l'abonnement, les droits Premium ni le stockage.
      // Achat d'espace de stockage (paiement unique, 0610) : même principe, grant_storage_pack.
      if (isStorageSession(session)) {
        const fresh = await getStripe().checkout.sessions.retrieve(session.id)
        await grantStorageForSession(fresh, 'webhook')
        break
      }
      if (isCreditSession(session)) {
        const fresh = await getStripe().checkout.sessions.retrieve(session.id)
        await grantCreditsForSession(fresh, 'webhook')
        break
      }
      if (session.mode !== 'subscription') break
      const subId = idOf(session.subscription)
      const hint = isUuid(session.client_reference_id) ? session.client_reference_id : session.metadata?.user_id
      if (!subId) break
      const res = await syncSubscription(subId, hint)
      if (!res.ok) logUnresolved(event, res)
      break
    }

    // Crédits IA remboursés en totalité ou contestés : solde restant du lot révoqué et journalisé
    // (credits_revoke_payment, 0520 ; les analyses déjà faites restent). Remboursement partiel :
    // journalisé, à traiter à la main (ajustement admin motivé, docs/STRIPE.md).
    case 'charge.refunded':
    case 'charge.dispute.created': {
      const obj = event.data.object as { payment_intent?: string | { id: string } | null; refunded?: boolean }
      const pi = idOf(obj.payment_intent)
      if (!pi) break
      if (event.type === 'charge.refunded' && !obj.refunded) {
        console.warn('[ai-credits] remboursement partiel, lot conservé', { pi: pi.slice(-8) })
        break
      }
      const reason = event.type === 'charge.refunded' ? 'refund' : 'dispute'
      await revokeCreditsForPayment(pi, reason)
      // Espace de stockage acheté par ce paiement (0610) : lots révoqués, fichiers conservés.
      await revokeStorageForPayment(pi, reason)
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
      // « Terminé » d'après l'ÉVÉNEMENT (pas l'état précédent en base, qui dépend de l'ordre
      // de livraison) : un abonnement réellement payé se termine en `canceled` ; un Checkout
      // abandonné finit en `incomplete_expired` et n'envoie rien. Un doublon résilié ne
      // passe pas ici (synchronisation refusée plus haut).
      if (event.type === 'customer.subscription.deleted' && payload.status === 'canceled') {
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
      // Facture relue via le SDK (version d'API épinglée) : jamais les champs du payload brut.
      const invoice = await retrieveInvoice(event.data.object)
      const subId = invoiceSubscriptionId(invoice)
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
      const invoice = await retrieveInvoice(event.data.object)
      const subId = invoiceSubscriptionId(invoice)
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
