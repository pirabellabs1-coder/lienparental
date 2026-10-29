// Événements Stripe traités par POST /api/stripe/webhook (lib/billing/webhook.ts).
// Module PUR : partagé par le webhook, le script scripts/stripe-setup.ts (abonnement
// de l'endpoint à exactement ces événements) et les tests.
export const HANDLED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  // Crédits IA (recharges) : remboursement total ou litige → solde restant du lot révoqué et
  // journalisé (credits_revoke_payment, 0520). L'achat lui-même passe par checkout.session.completed.
  'charge.refunded',
  'charge.dispute.created',
] as const

export type HandledStripeEvent = (typeof HANDLED_STRIPE_EVENTS)[number]

export function isHandledStripeEvent(type: string): type is HandledStripeEvent {
  return (HANDLED_STRIPE_EVENTS as readonly string[]).includes(type)
}

/**
 * Version d'API Stripe épinglée : celle du SDK installé (stripe 17.x). Le client
 * (lib/billing/stripe.ts) ET l'endpoint webhook (scripts/stripe-setup.ts) l'utilisent,
 * pour que les payloads aient la forme attendue par le code.
 */
export const STRIPE_API_VERSION = '2025-02-24.acacia' as const

type Expandable = string | { id: string } | null | undefined
const idOf = (v: Expandable): string | null => (!v ? null : typeof v === 'string' ? v : v.id)

/**
 * Abonnement d'une facture, quelle que soit la forme du payload :
 *  - acacia et antérieures : `invoice.subscription` ;
 *  - basil (2025-03-31) et suivantes : `invoice.parent.subscription_details.subscription`
 *    (et `lines.data[].parent.subscription_item_details.subscription`).
 * Défense en profondeur si l'endpoint a été créé avec une autre version d'API.
 */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const inv = invoice as {
    subscription?: Expandable
    parent?: { subscription_details?: { subscription?: Expandable } | null } | null
    lines?: { data?: { parent?: { subscription_item_details?: { subscription?: Expandable } | null } | null; subscription?: Expandable }[] }
  } | null
  if (!inv) return null
  return (
    idOf(inv.subscription) ??
    idOf(inv.parent?.subscription_details?.subscription) ??
    idOf(inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ??
    idOf(inv.lines?.data?.[0]?.subscription) ??
    null
  )
}
