// Retour de Stripe Checkout : validation de la session et synchronisation
// immédiate de l'abonnement (même chemin que le webhook), sans attendre ce dernier.
// Module PUR : les accès Stripe / base sont injectés (testés dans tests/billing.test.ts).
import type { PlanId } from '@/components/profil/pricing'
import { planOf, type SubscriptionRecord, type UpsertResult } from './sync-core'

/** Identifiant de session Checkout (`cs_test_…` / `cs_live_…`). Toute autre valeur est rejetée. */
const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

export function parseCheckoutSessionId(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && SESSION_RE.test(v) ? v : null
}

type Expandable = string | { id: string } | null | undefined
const idOf = (v: Expandable): string | null => (!v ? null : typeof v === 'string' ? v : v.id)

/** Sous-ensemble de Stripe.Checkout.Session utilisé ici. */
export type CheckoutSessionLike = {
  id: string
  mode: string | null
  status: string | null
  payment_status: string | null
  client_reference_id: string | null
  customer: Expandable
  subscription: Expandable
}

/**
 * La session appartient-elle à l'utilisateur connecté ?
 * Toujours vérifié côté serveur : client_reference_id posé à la création ET,
 * si un customer Stripe est déjà enregistré pour l'utilisateur, même customer.
 * Un identifiant de session d'un autre compte est traité comme inexistant.
 */
export function checkoutSessionOwnedBy(session: CheckoutSessionLike, userId: string, customerId: string | null): boolean {
  if (!userId || session.client_reference_id !== userId) return false
  if (customerId && idOf(session.customer) !== customerId) return false
  return true
}

export type CheckoutReturnState =
  /** Abonnement synchronisé et avantages ouverts. */
  | { state: 'active'; plan: PlanId }
  /** Paiement reçu par Stripe mais abonnement pas encore actif (banque, prélèvement) : réessayer. */
  | { state: 'pending' }
  /** Session encore ouverte : le paiement n'a pas été terminé. */
  | { state: 'open' }
  /** Session expirée : aucun paiement. */
  | { state: 'expired' }
  /** Identifiant invalide, inconnu ou appartenant à un autre compte. */
  | { state: 'not_found' }

export type CheckoutDeps = {
  retrieveSession(id: string): Promise<CheckoutSessionLike | null>
  getCustomerId(userId: string): Promise<string | null>
  getLocal(userId: string): Promise<SubscriptionRecord | null>
  /** Relit l'abonnement chez Stripe et l'écrit en base (même code que le webhook). */
  syncSubscription(subscriptionId: string, userIdHint: string): Promise<UpsertResult>
}

/**
 * Vérifie la session Checkout (appartenance) puis synchronise l'abonnement.
 * Idempotent : peut être appelé à chaque interrogation de l'écran de confirmation.
 */
export async function resolveCheckoutReturn(deps: CheckoutDeps, userId: string, rawSessionId: unknown, now = new Date()): Promise<CheckoutReturnState> {
  const sessionId = parseCheckoutSessionId(rawSessionId)
  if (!sessionId) return { state: 'not_found' }

  const [session, customerId] = await Promise.all([deps.retrieveSession(sessionId), deps.getCustomerId(userId)])
  if (!session || session.mode !== 'subscription' || !checkoutSessionOwnedBy(session, userId, customerId)) {
    return { state: 'not_found' }
  }
  if (session.status === 'expired') return { state: 'expired' }
  if (session.status !== 'complete') return { state: 'open' }

  const subId = idOf(session.subscription)
  if (!subId) return { state: 'pending' }

  // Déjà reflété (webhook arrivé, ou interrogation précédente) : pas d'appel Stripe de plus.
  const local = await deps.getLocal(userId)
  if (local && local.stripe_subscription_id === subId) {
    const plan = planOf(local, now)
    if (plan !== 'gratuit') return { state: 'active', plan }
  }

  const res = await deps.syncSubscription(subId, userId)
  if (res.ok) {
    const plan = planOf(res.record, now)
    if (plan !== 'gratuit') return { state: 'active', plan }
  }
  return { state: 'pending' }
}
