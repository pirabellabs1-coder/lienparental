// Interrupteurs facturation. Évalués côté serveur uniquement (les clés ne
// sont jamais exposées au navigateur : importé depuis un composant client,
// BILLING_LIVE vaut toujours false).
import { STRIPE_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'

/** Vraie facturation : Stripe ET Supabase configurés. Sinon, écrans de démonstration. */
export const BILLING_LIVE = STRIPE_ENABLED && SUPABASE_ENABLED

/** Délai de grâce (jours) pendant lequel un abonnement `past_due` reste Premium. */
export const BILLING_GRACE_DAYS = (() => {
  const n = Number.parseInt(process.env.BILLING_GRACE_DAYS ?? '', 10)
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : 14
})()

/** Taxe automatique Stripe Tax, uniquement si STRIPE_TAX=on (nécessite l'activation Stripe Tax). */
export const STRIPE_TAX_ENABLED = process.env.STRIPE_TAX === 'on'

/** URL publique de l'app, sans slash final. Null si absente ou invalide. */
export function appOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}
