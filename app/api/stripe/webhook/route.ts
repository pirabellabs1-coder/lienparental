import { after, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getStripe } from '@/lib/billing/stripe'
import { claimEvent, handleStripeEvent, markProcessed, releaseClaim } from '@/lib/billing/webhook'

/**
 * POST /api/stripe/webhook — synchronisation des abonnements depuis Stripe.
 *
 * Événements traités : checkout.session.completed, customer.subscription.created|updated|deleted,
 * invoice.paid, invoice.payment_failed (les autres sont acquittés et ignorés).
 * - Signature vérifiée sur le corps brut (STRIPE_WEBHOOK_SECRET).
 * - Idempotent : table stripe_events (Stripe livre au moins une fois, parfois en double).
 * - Réponse 200 dès l'état synchronisé ; les e-mails partent après la réponse (after()).
 * - Erreur de traitement → 500 générique : Stripe relivre avec backoff.
 * Les réponses ne contiennent jamais de détail interne.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ok = () => NextResponse.json({ received: true })
const failure = (status: number, code: string) => NextResponse.json({ error: { code } }, { status })

export async function POST(req: Request) {
  const whsec = process.env.STRIPE_WEBHOOK_SECRET
  if (!BILLING_LIVE || !whsec) return failure(503, 'not_configured')

  const sig = req.headers.get('stripe-signature')
  if (!sig) return failure(400, 'invalid_signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, whsec)
  } catch {
    return failure(400, 'invalid_signature')
  }

  let claim
  try {
    claim = await claimEvent(event)
  } catch (err) {
    console.error('[stripe-webhook] stockage indisponible', { id: event.id, msg: err instanceof Error ? err.message : 'unknown' })
    return failure(500, 'processing_failed')
  }
  if (claim === 'done') return ok()
  if (claim === 'in_flight') return failure(409, 'in_progress')

  try {
    const deferred = await handleStripeEvent(event)
    await markProcessed(event.id)
    if (deferred.length > 0) {
      after(async () => {
        for (const task of deferred) {
          try {
            await task()
          } catch (err) {
            console.error('[stripe-webhook] e-mail non envoyé', { id: event.id, msg: err instanceof Error ? err.message : 'unknown' })
          }
        }
      })
    }
    return ok()
  } catch (err) {
    console.error('[stripe-webhook] traitement échoué', {
      id: event.id,
      type: event.type,
      msg: err instanceof Error ? err.message : 'unknown',
    })
    await releaseClaim(event.id).catch(() => undefined)
    return failure(500, 'processing_failed')
  }
}
