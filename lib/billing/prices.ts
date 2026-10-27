import 'server-only'
import type Stripe from 'stripe'
import type { Cycle, Offer, PaidPlan } from '@/components/profil/pricing'
import type { SubscriptionPlan } from '@/lib/supabase/types'
import { offerFromSubscriptionPlan, subscriptionPlanFor } from './plans'

/**
 * Variables d'environnement des Price IDs, par formule et par cycle.
 *   Premium        : STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY (historique)
 *   Coparentalité+ : STRIPE_PRICE_COPARENTALITE_MONTHLY / STRIPE_PRICE_COPARENTALITE_YEARLY
 */
const PRICE_ENV: Record<PaidPlan, Record<Cycle, string>> = {
  premium: { mensuel: 'STRIPE_PRICE_MONTHLY', annuel: 'STRIPE_PRICE_YEARLY' },
  coparentalite: { mensuel: 'STRIPE_PRICE_COPARENTALITE_MONTHLY', annuel: 'STRIPE_PRICE_COPARENTALITE_YEARLY' },
}

function envPrice(name: string): string | null {
  const id = process.env[name]
  return id && id.startsWith('price_') ? id : null
}

/** Price ID Stripe d'une formule ; null si la variable est absente ou invalide. */
export function priceIdForOffer(offer: Offer): string | null {
  return envPrice(PRICE_ENV[offer.plan][offer.cycle])
}

/** Price ID Premium d'un cycle (historique). */
export function priceIdFor(cycle: Cycle): string | null {
  return priceIdForOffer({ plan: 'premium', cycle })
}

/** La formule est-elle vendable (Price configuré) ? */
export function isOfferConfigured(offer: Offer): boolean {
  return priceIdForOffer(offer) !== null
}

type PriceLike = Pick<Stripe.Price, 'id' | 'recurring'> & { metadata?: Stripe.Metadata | null }

/**
 * Formule d'un Price Stripe. Correspondance exacte sur les quatre variables, puis
 * repli UNIQUEMENT sur les Prices créés par scripts/stripe-setup.ts (metadata
 * `plan` = premium | coparentalite ET `lp_lookup_key`), cycle d'après la récurrence.
 * Tout autre Price est INCONNU : null, jamais d'avantage accordé par défaut.
 */
export function offerFromPrice(price: PriceLike | null | undefined): Offer | null {
  if (!price) return null
  for (const plan of ['coparentalite', 'premium'] as const) {
    for (const cycle of ['mensuel', 'annuel'] as const) {
      if (price.id === envPrice(PRICE_ENV[plan][cycle])) return { plan, cycle }
    }
  }
  const metaPlan = price.metadata?.plan
  const interval = price.recurring?.interval
  if ((metaPlan === 'premium' || metaPlan === 'coparentalite') && price.metadata?.lp_lookup_key && (interval === 'month' || interval === 'year')) {
    return { plan: metaPlan, cycle: interval === 'year' ? 'annuel' : 'mensuel' }
  }
  console.error('[billing] Price Stripe inconnu', { price: price.id })
  return null
}

/** Formule d'un Price ID seul (phases de subscription schedule). */
export function offerFromPriceId(id: string | null | undefined): Offer | null {
  if (!id) return null
  for (const plan of ['coparentalite', 'premium'] as const) {
    for (const cycle of ['mensuel', 'annuel'] as const) {
      if (id === envPrice(PRICE_ENV[plan][cycle])) return { plan, cycle }
    }
  }
  return null
}


export function planFromOffer(offer: Offer): SubscriptionPlan {
  return subscriptionPlanFor(offer)
}

/** subscriptions.plan → formule. */
export function offerFromPlan(plan: SubscriptionPlan): Offer {
  return offerFromSubscriptionPlan(plan)
}

/** Cycle d'un subscriptions.plan (historique). */
export function cycleFromPlan(plan: SubscriptionPlan): Cycle {
  return offerFromSubscriptionPlan(plan).cycle
}

/** Valide une valeur reçue du client ; null si invalide (jamais de défaut silencieux). */
export function parseCycleStrict(value: unknown): Cycle | null {
  return value === 'mensuel' || value === 'annuel' ? value : null
}

/**
 * Formule reçue du client. Absente → Premium (compatibilité des anciens
 * formulaires qui n'envoient que `cycle`). Présente mais inconnue → null.
 */
export function parsePlanStrict(value: unknown): PaidPlan | null {
  if (value === undefined || value === null || value === '') return 'premium'
  return value === 'premium' || value === 'coparentalite' ? value : null
}
