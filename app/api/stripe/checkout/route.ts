import { NextResponse } from 'next/server'
import { appOrigin, STRIPE_TAX_ENABLED } from '@/lib/billing/config'
import { apiError, fail, isSameOrigin, limitBilling, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { parseCycleStrict, parsePlanStrict, priceIdForOffer } from '@/lib/billing/prices'
import { getStripe } from '@/lib/billing/stripe'
import { getOrCreateCustomer, getSubscription, isBlockingStatus } from '@/lib/billing/subscription'

/**
 * POST /api/stripe/checkout — ouvre une session Stripe Checkout (abonnement).
 *
 * Corps : `cycle=mensuel|annuel` et `formule=premium|coparentalite` (formulaire)
 * ou `{ "cycle": "annuel", "formule": "coparentalite" }` (JSON). `formule`
 * absente = Premium (compatibilité). Le prix est TOUJOURS résolu côté serveur.
 * Retour : success_url → /app/abonnement/confirmation, cancel_url → /app/abonnement.
 * Réponses :
 *  - formulaire : 303 → page Stripe Checkout (ou retour écran avec ?erreur=code)
 *  - JSON (Accept: application/json) : 200 `{ url }`
 *  - 400 invalid_cycle / invalid_plan · 401 unauthenticated · 403 invalid_origin · 429 rate_limited
 *  - 409 already_subscribed · 503 billing_disabled / stripe_unavailable
 * Aucune donnée de carte ne transite par l'application.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/abonnement'

export async function POST(req: Request) {
  const base = appOrigin()
  if (!base) return apiError(500, 'misconfigured', 'Service momentanément indisponible.')
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', 'Requête refusée.')

  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)
  const { user } = auth
  const limited = await limitBilling('checkout', user.id)
  if (limited) return limited

  const body = await readBody(req)
  const cycle = parseCycleStrict(body.cycle)
  if (!cycle) return fail(req, 400, 'invalid_cycle', 'Formule inconnue.', BACK)
  const formule = parsePlanStrict(body.formule)
  if (!formule) return fail(req, 400, 'invalid_plan', 'Formule inconnue.', BACK)
  const price = priceIdForOffer({ plan: formule, cycle })
  if (!price) return fail(req, 503, 'misconfigured', 'Service momentanément indisponible.', BACK)

  try {
    // Un seul abonnement par compte : on renvoie vers la gestion plutôt que d'en créer un second.
    const existing = await getSubscription(user.id)
    if (existing && isBlockingStatus(existing.status)) {
      if (wantsJson(req)) return apiError(409, 'already_subscribed', 'Vous avez déjà un abonnement en cours.')
      return seeOther('/app/abonnement')
    }

    const customer = await getOrCreateCustomer(user)
    const stripe = getStripe()

    // Anti-doublon : une session ouverte pour le même Price est réutilisée, les autres
    // sont expirées (deux onglets, retour arrière, double clic) : un seul abonnement possible.
    const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 10, expand: ['data.line_items'] })
    for (const s of open.data) {
      const samePrice = s.line_items?.data?.[0]?.price?.id === price
      const fresh = s.expires_at - Math.floor(Date.now() / 1000) > 5 * 60
      if (samePrice && fresh && s.url) {
        if (wantsJson(req)) return NextResponse.json({ url: s.url }, { headers: { 'Cache-Control': 'no-store' } })
        return seeOther(s.url)
      }
      await stripe.checkout.sessions.expire(s.id).catch(() => undefined)
    }

    const session = await stripe.checkout.sessions.create({
      // Durée minimale autorisée par Stripe : une session oubliée ne reste pas payable 24 h.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 30,
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      // Lien explicite user ↔ session/abonnement : exploité par le webhook,
      // jamais l'e-mail du client.
      client_reference_id: user.id,
      metadata: { user_id: user.id, cycle, formule },
      subscription_data: { metadata: { user_id: user.id, formule } },
      // Retour : écran de confirmation qui vérifie la session et synchronise l'abonnement
      // sans attendre le webhook (GET /api/stripe/status).
      success_url: `${base}/app/abonnement/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/app/abonnement?formule=${formule}&cycle=${cycle}&info=checkout_canceled`,
      // Codes promo saisissables sur Checkout (créés dans le Dashboard) : voir docs/STRIPE.md.
      allow_promotion_codes: true,
      locale: 'fr',
      billing_address_collection: STRIPE_TAX_ENABLED ? 'required' : 'auto',
      ...(STRIPE_TAX_ENABLED
        ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const, name: 'auto' as const } }
        : {}),
    })

    if (!session.url) return fail(req, 503, 'stripe_unavailable', 'Paiement momentanément indisponible.', BACK)
    if (wantsJson(req)) return NextResponse.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } })
    return seeOther(session.url)
  } catch (err) {
    logError('checkout', err)
    return fail(req, 503, 'stripe_unavailable', 'Paiement momentanément indisponible. Réessayez dans un instant.', BACK)
  }
}
