import 'server-only'
import { resolveCheckoutReturn, type CheckoutReturnState, type CheckoutSessionLike } from './checkout-core'
import { getStripe } from './stripe'
import { getCustomerId, getSubscription, syncSubscription } from './subscription'

/** Session Checkout relue chez Stripe ; null si inconnue (identifiant d'un autre compte Stripe, supprimée…). */
async function retrieveSession(id: string): Promise<CheckoutSessionLike | null> {
  try {
    const s = await getStripe().checkout.sessions.retrieve(id)
    return {
      id: s.id,
      mode: s.mode,
      status: s.status,
      payment_status: s.payment_status,
      client_reference_id: s.client_reference_id,
      customer: s.customer as CheckoutSessionLike['customer'],
      subscription: s.subscription as CheckoutSessionLike['subscription'],
    }
  } catch (err) {
    const e = err as { code?: string; statusCode?: number } | null
    if (e?.code === 'resource_missing' || e?.statusCode === 404) return null
    throw err
  }
}

/**
 * Retour de Checkout : vérifie la session (appartenance à l'utilisateur) et
 * synchronise l'abonnement tout de suite, par le même code que le webhook
 * (idempotent). Le statut change donc même si le webhook a du retard.
 */
export function syncFromCheckoutSession(userId: string, sessionId: unknown): Promise<CheckoutReturnState> {
  return resolveCheckoutReturn(
    { retrieveSession, getCustomerId, getLocal: getSubscription, syncSubscription },
    userId,
    sessionId,
  )
}
