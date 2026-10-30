import { getLocale, getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getCurrentUser } from '@/lib/auth/session'
import { STORAGE_CURRENCY, STORAGE_KIND, STORAGE_VALIDITY_MONTHS, parseStoragePack } from '@/lib/billing/storage-packs'
import { appOrigin, STRIPE_TAX_ENABLED } from '@/lib/billing/config'
import { DEMO_BILLING } from '@/lib/billing/demo'
import { apiError, fail, isSameOrigin, limitBilling, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { BILLING_RATE_LIMITS } from '@/lib/billing/limits'
import { getStripe } from '@/lib/billing/stripe'
import { getOrCreateCustomer } from '@/lib/billing/subscription'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { isLocale, type Locale } from '@/lib/i18n/config'

/**
 * POST /api/stripe/stockage — achat d'un pack d'espace de stockage (paiement unique, 12 mois).
 *
 * Corps (formulaire ou JSON) : `pack=<storage_20|storage_50|storage_100>` et `renonciation=on`
 * (accès immédiat demandé, perte du droit de rétractation). Montant, devise, espace et validité
 * viennent UNIQUEMENT du catalogue serveur (lib/billing/storage-packs.ts, Checkout `price_data`).
 * L'espace est accordé UNIQUEMENT après confirmation serveur (webhook checkout.session.completed
 * ou relecture de la session au retour, grant_storage_pack 0610, idempotent) ; jamais sur la
 * seule redirection. Démonstration : achat SIMULÉ, aucun espace réellement ajouté.
 * Réponses : formulaire → 303 vers Stripe Checkout (ou retour /app/profil/stockage?erreur=code) ;
 * JSON → 200 `{ url }` ; 400 invalid_pack / waiver_required · 401 · 403 invalid_origin · 429 · 503.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/profil/stockage'

const STRIPE_LOCALE: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = { fr: 'fr', en: 'en', pt: 'pt-BR' }

function waiverAccepted(v: unknown): boolean {
  return v === true || v === 'on' || v === 'true' || v === '1'
}

export async function POST(req: Request) {
  const t = await getTranslations('server.stripe')
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', t('refused'))

  // --- Démonstration : achat simulé, aucun paiement ----------------------------------
  if (DEMO_BILLING) {
    const demoBack = (status: number, code: string, message: string) =>
      wantsJson(req) ? apiError(status, code, message) : NextResponse.redirect(new URL(`${BACK}?erreur=${code}`, appOrigin() ?? req.url), 303)
    const user = await getCurrentUser()
    if (!user) return demoBack(401, 'unauthenticated', t('signInRequired'))
    const { limit, windowMs } = BILLING_RATE_LIMITS.demo
    const rl = await rateLimit(userKey('billing:demo', user.id), limit, windowMs)
    if (!rl.ok) return rateLimitedResponse(rl)
    const body = await readBody(req)
    const pack = parseStoragePack(body.pack)
    if (!pack) return demoBack(400, 'invalid_pack', t('creditsInvalidPack'))
    if (!waiverAccepted(body.renonciation)) return demoBack(400, 'waiver_required', t('creditsWaiverRequired'))
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
  const limited = await limitBilling('storage', user.id)
  if (limited) return limited

  const body = await readBody(req)
  const pack = parseStoragePack(body.pack)
  if (!pack) return fail(req, 400, 'invalid_pack', t('creditsInvalidPack'), BACK)
  if (!waiverAccepted(body.renonciation)) return fail(req, 400, 'waiver_required', t('creditsWaiverRequired'), BACK)

  const rawLocale = await getLocale().catch(() => 'fr')
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'fr'
  const ts = await getTranslations({ locale, namespace: 'vault.storage' })

  try {
    const customer = await getOrCreateCustomer(user)
    const now = Math.floor(Date.now() / 1000)
    const meta = { kind: STORAGE_KIND, pack: pack.id, user_id: user.id, price_cents: String(pack.priceCents), gigabytes: String(pack.gigabytes), validity_months: String(STORAGE_VALIDITY_MONTHS) }
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      expires_at: now + 30 * 60 + 30,
      customer,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STORAGE_CURRENCY,
            unit_amount: pack.priceCents,
            ...(STRIPE_TAX_ENABLED ? { tax_behavior: 'inclusive' as const } : {}),
            product_data: {
              name: `Lien Parental – ${ts('packName', { gb: pack.gigabytes })}`,
              description: ts('validity', { months: STORAGE_VALIDITY_MONTHS }),
            },
          },
        },
      ],
      metadata: { ...meta, waiver_at: String(now) },
      payment_intent_data: { metadata: meta },
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
    logError('storage', err)
    return fail(req, 503, 'stripe_unavailable', t('paymentUnavailable'), BACK)
  }
}
