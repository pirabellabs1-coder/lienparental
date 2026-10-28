import { getLocale, getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getCurrentUser } from '@/lib/auth/session'
import { readDemoAi, writeDemoAi } from '@/lib/ai/credits'
import { demoAddCredits } from '@/lib/ai/credits-core'
import { AI_CREDIT_CURRENCY, AI_CREDIT_VALIDITY_MONTHS, AI_CREDITS_KIND, parseCreditPack } from '@/lib/billing/credit-packs'
import { appOrigin, STRIPE_TAX_ENABLED } from '@/lib/billing/config'
import { DEMO_BILLING } from '@/lib/billing/demo'
import { apiError, fail, isSameOrigin, limitBilling, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { BILLING_RATE_LIMITS } from '@/lib/billing/limits'
import { getStripe } from '@/lib/billing/stripe'
import { getOrCreateCustomer } from '@/lib/billing/subscription'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { isLocale, type Locale } from '@/lib/i18n/config'

/**
 * POST /api/stripe/credits — achat d'un pack de crédits d'analyses du Coach IA (paiement unique).
 *
 * Corps (formulaire ou JSON) : `pack=pack10|pack30|pack100` et `renonciation=on` (case obligatoire :
 * accès immédiat demandé et perte du droit de rétractation dès la première utilisation).
 * Le montant, la devise et la quantité viennent UNIQUEMENT de lib/billing/credit-packs.ts
 * (Stripe Checkout `price_data`) : le client n'envoie qu'un identifiant de pack.
 * Le crédit est accordé par le webhook (checkout.session.completed, payée) ou au retour de paiement,
 * de façon idempotente (session Stripe unique, grant_ai_credits 0510).
 * Démonstration (sans Supabase ni Stripe) : achat SIMULÉ, crédits ajoutés au compte de démo (cookie).
 * Réponses : formulaire → 303 vers Stripe Checkout (ou retour /app/coach/credits?erreur=code) ;
 * JSON → 200 `{ url }` ; 400 invalid_pack / waiver_required · 401 · 403 invalid_origin · 429 · 503.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/coach/credits'

const STRIPE_LOCALE: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = { fr: 'fr', en: 'en', pt: 'pt-BR' }

/** Case de renonciation cochée (formulaire : « on » ; JSON : true). */
function waiverAccepted(v: unknown): boolean {
  return v === true || v === 'on' || v === 'true' || v === '1'
}

export async function POST(req: Request) {
  const t = await getTranslations('server.stripe')
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', t('refused'))

  // --- Démonstration : achat simulé, aucun paiement ----------------------------------
  if (DEMO_BILLING) {
    // Démo sans NEXT_PUBLIC_APP_URL : redirection relative à la requête (même origine vérifiée).
    const demoBack = (status: number, code: string, message: string) =>
      wantsJson(req) ? apiError(status, code, message) : NextResponse.redirect(new URL(`${BACK}?erreur=${code}`, appOrigin() ?? req.url), 303)
    const user = await getCurrentUser()
    const demo = await readDemoAi()
    if (!user || !demo) return demoBack(401, 'unauthenticated', t('signInRequired'))
    const { limit, windowMs } = BILLING_RATE_LIMITS.demo
    const rl = await rateLimit(userKey('billing:demo', user.id), limit, windowMs)
    if (!rl.ok) return rateLimitedResponse(rl)
    const body = await readBody(req)
    const pack = parseCreditPack(body.pack)
    if (!pack) return demoBack(400, 'invalid_pack', t('creditsInvalidPack'))
    if (!waiverAccepted(body.renonciation)) return demoBack(400, 'waiver_required', t('creditsWaiverRequired'))
    await writeDemoAi(demo.account, demoAddCredits(demo.state, pack))
    const target = `${BACK}?achat=demo&pack=${pack.id}`
    if (wantsJson(req)) return NextResponse.json({ url: target, demo: true }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.redirect(new URL(target, appOrigin() ?? req.url), 303)
  }

  // --- Paiement réel (Stripe, mode TEST ou LIVE selon les clés) -------------------------
  const base = appOrigin()
  if (!base) return apiError(500, 'misconfigured', t('lib.misconfigured'))
  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)
  const { user } = auth
  const limited = await limitBilling('credits', user.id)
  if (limited) return limited

  const body = await readBody(req)
  const pack = parseCreditPack(body.pack)
  if (!pack) return fail(req, 400, 'invalid_pack', t('creditsInvalidPack'), BACK)
  if (!waiverAccepted(body.renonciation)) return fail(req, 400, 'waiver_required', t('creditsWaiverRequired'), BACK)

  const rawLocale = await getLocale().catch(() => 'fr')
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'fr'
  const tc = await getTranslations({ locale, namespace: 'coach.credits' })

  try {
    const customer = await getOrCreateCustomer(user)
    const now = Math.floor(Date.now() / 1000)
    // Prix et quantité figés dans la session (écrite par le serveur seul) : un changement de tarif
    // pendant les 30 minutes de validité ne fait jamais perdre un paiement encaissé.
    const meta = { kind: AI_CREDITS_KIND, pack: pack.id, user_id: user.id, price_cents: String(pack.priceCents), analyses: String(pack.analyses) }
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Durée minimale autorisée par Stripe : une session oubliée ne reste pas payable 24 h.
      expires_at: now + 30 * 60 + 30,
      customer,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: AI_CREDIT_CURRENCY,
            unit_amount: pack.priceCents,
            // Prix affichés TTC : avec Stripe Tax, la taxe est incluse dans le montant.
            ...(STRIPE_TAX_ENABLED ? { tax_behavior: 'inclusive' as const } : {}),
            product_data: {
              name: `Lien Parental – ${tc('packName', { count: pack.analyses })}`,
              description: tc('validity', { months: AI_CREDIT_VALIDITY_MONTHS }),
            },
          },
        },
      ],
      // waiver_at : horodatage de la case « accès immédiat / renonciation » (preuve, copiée en base).
      metadata: { ...meta, waiver_at: String(now) },
      payment_intent_data: { metadata: meta },
      // Carte uniquement : paiement confirmé immédiatement (pas de moyen de paiement différé).
      payment_method_types: ['card'],
      success_url: `${base}${BACK}?achat=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${BACK}?achat=annule`,
      locale: STRIPE_LOCALE[locale],
      billing_address_collection: STRIPE_TAX_ENABLED ? 'required' : 'auto',
      ...(STRIPE_TAX_ENABLED
        ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const, name: 'auto' as const } }
        : {}),
    })
    if (!session.url) return fail(req, 503, 'stripe_unavailable', t('paymentUnavailableShort'), BACK)
    if (wantsJson(req)) return NextResponse.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } })
    return seeOther(session.url)
  } catch (err) {
    logError('credits', err)
    return fail(req, 503, 'stripe_unavailable', t('paymentUnavailable'), BACK)
  }
}
