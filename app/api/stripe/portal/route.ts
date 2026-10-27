import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import { apiError, fail, isSameOrigin, limitBilling, logError, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { createPortalUrl } from '@/lib/billing/manage'

/**
 * POST /api/stripe/portal — session du portail client Stripe
 * (moyen de paiement, factures, coordonnées de facturation).
 *  - JSON : 200 `{ url }` (recommandé : la CSP `form-action` ne couvre pas billing.stripe.com)
 *  - formulaire : 303 → portail
 *  - 401 · 403 invalid_origin · 409 no_customer · 429 · 503
 * Retour du portail : /app/abonnement?info=portal (resynchronisation immédiate de l'abonnement).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/abonnement'

export async function POST(req: Request) {
  const t = await getTranslations('server.stripe')
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', t('refused'))
  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)
  const limited = await limitBilling('portal', auth.user.id)
  if (limited) return limited

  try {
    const res = await createPortalUrl(auth.user.id)
    if (!res.ok) return fail(req, res.status, res.code, (t.has(`lib.${res.code}`) ? t(`lib.${res.code}`) : res.message), BACK)
    if (wantsJson(req)) return NextResponse.json({ url: res.url }, { headers: { 'Cache-Control': 'no-store' } })
    return seeOther(res.url)
  } catch (err) {
    logError('portal', err)
    return fail(req, 503, 'stripe_unavailable', t('portalUnavailable'), BACK)
  }
}
