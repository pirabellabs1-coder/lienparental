import 'server-only'
import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * Client Stripe unique par process. Version d'API = celle épinglée par le SDK
 * installé (pas de cast forcé). Timeout court + 2 retries réseau automatiques
 * (le SDK ajoute lui-même une Idempotency-Key aux retries des POST).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY missing')
  if (!_stripe) {
    _stripe = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 10_000,
      appInfo: { name: 'lien-parental' },
    })
  }
  return _stripe
}

/** Extrait l'id d'un champ Stripe « expandable » (string | objet | null). */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}
