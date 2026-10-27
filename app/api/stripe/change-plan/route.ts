import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { fail, isSameOrigin, apiError, limitBilling, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { changePlan } from '@/lib/billing/manage'
import { parseCycleStrict, parsePlanStrict } from '@/lib/billing/prices'
import { parseRequestId } from '@/lib/billing/change-core'

/**
 * POST /api/stripe/change-plan : `{ "cycle": "mensuel" | "annuel", "formule"?: "premium" | "coparentalite", "request_id"?: UUID }`
 * (`formule` absente = Premium, compatibilité).
 *  - même niveau, autre cycle : au prochain cycle, sans prorata (subscription schedule) ;
 *  - montée de niveau : immédiate, prorata facturé et prélevé tout de suite ;
 *  - descente de niveau : immédiate, crédit au prorata sur les prochaines factures.
 * Choisir la formule actuelle annule un changement programmé.
 *  - 200 `{ status: 'scheduled'|'unchanged'|'pending_change_canceled'|'upgraded'|'downgraded', formule, cycle, effective_at }`
 *  - 400 invalid_cycle|invalid_plan · 401 · 402 payment_failed · 403 · 429
 *  - 409 no_subscription|cancel_pending|subscription_not_active · 503
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/abonnement'

export async function POST(req: Request) {
  const t = await getTranslations('server.stripe')
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', t('refused'))
  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)
  const limited = await limitBilling('change-plan', auth.user.id)
  if (limited) return limited

  const body = await readBody(req)
  const cycle = parseCycleStrict(body.cycle)
  if (!cycle) return fail(req, 400, 'invalid_cycle', t('unknownPlan'), BACK)
  const formule = parsePlanStrict(body.formule)
  if (!formule) return fail(req, 400, 'invalid_plan', t('unknownPlan'), BACK)
  // Identifiant propre à chaque clic (clé d'idempotence Stripe) ; formulaire sans JS : généré ici.
  const requestId = body.request_id === undefined ? crypto.randomUUID() : parseRequestId(body.request_id)
  if (!requestId) return fail(req, 400, 'invalid_body', t('invalidBody'), BACK)

  try {
    const res = await changePlan(auth.user.id, { plan: formule, cycle }, requestId)
    if (!res.ok) return fail(req, res.status, res.code, (t.has(`lib.${res.code}`) ? t(`lib.${res.code}`) : res.message), BACK)
    // Droits recalculés partout (layout, profil, quotas) au prochain rendu.
    revalidatePath('/app', 'layout')
    if (wantsJson(req)) {
      return NextResponse.json(
        { status: res.status, formule: res.offer.plan, cycle: res.cycle, effective_at: res.effective_at, pending: res.pending },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return seeOther(`/app/abonnement?info=${res.status}`)
  } catch (err) {
    logError('change-plan', err)
    return fail(req, 503, 'stripe_unavailable', t('changeUnavailable'), BACK)
  }
}
