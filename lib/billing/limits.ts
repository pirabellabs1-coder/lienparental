// Limites de débit des routes /api/stripe/* (par utilisateur authentifié).
// Module PUR : valeurs partagées par lib/billing/http.ts et les tests.
// `status` : l'écran de confirmation interroge toutes les 3 s pendant 60 s (20 appels),
// la limite laisse de la marge pour un rechargement sans permettre de marteler Stripe.
export const BILLING_RATE_LIMITS = {
  checkout: { limit: 10, windowMs: 10 * 60_000 },
  credits: { limit: 10, windowMs: 10 * 60_000 },
  storage: { limit: 10, windowMs: 10 * 60_000 },
  'change-plan': { limit: 8, windowMs: 10 * 60_000 },
  cancel: { limit: 10, windowMs: 10 * 60_000 },
  portal: { limit: 20, windowMs: 10 * 60_000 },
  invoices: { limit: 30, windowMs: 60_000 },
  status: { limit: 40, windowMs: 60_000 },
  demo: { limit: 30, windowMs: 60_000 },
} as const

export type BillingRateAction = keyof typeof BILLING_RATE_LIMITS

/** Intervalle et durée d'interrogation de GET /api/stripe/status par l'écran de confirmation. */
export const STATUS_POLL_INTERVAL_MS = 3_000
export const STATUS_POLL_TIMEOUT_MS = 60_000
