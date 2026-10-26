import { NextResponse } from 'next/server'
import { fail, isSameOrigin, apiError, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { changePlan } from '@/lib/billing/manage'
import { parseCycleStrict, parsePlanStrict } from '@/lib/billing/prices'

/**
 * POST /api/stripe/change-plan — `{ "cycle": "mensuel" | "annuel", "formule"?: "premium" | "coparentalite" }`
 * (`formule` absente = Premium, compatibilité).
 *  - même niveau, autre cycle : au prochain cycle, sans prorata (subscription schedule) ;
 *  - montée de niveau : immédiate, prorata facturé et prélevé tout de suite ;
 *  - descente de niveau : immédiate, crédit au prorata sur les prochaines factures.
 * Choisir la formule actuelle annule un changement programmé.
 *  - 200 `{ status: 'scheduled'|'unchanged'|'pending_change_canceled'|'upgraded'|'downgraded', formule, cycle, effective_at }`
 *  - 400 invalid_cycle|invalid_plan · 401 · 402 payment_failed · 403
 *  - 409 no_subscription|cancel_pending|subscription_not_active · 503
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/profil/abonnement/changer'

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', 'Requête refusée.')
  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)

  const body = await readBody(req)
  const cycle = parseCycleStrict(body.cycle)
  if (!cycle) return fail(req, 400, 'invalid_cycle', 'Formule inconnue.', BACK)
  const formule = parsePlanStrict(body.formule)
  if (!formule) return fail(req, 400, 'invalid_plan', 'Formule inconnue.', BACK)

  try {
    const res = await changePlan(auth.user.id, { plan: formule, cycle })
    if (!res.ok) return fail(req, res.status, res.code, res.message, BACK)
    if (wantsJson(req)) {
      return NextResponse.json(
        { status: res.status, formule: res.offer.plan, cycle: res.cycle, effective_at: res.effective_at },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return seeOther(`/app/profil/abonnement?formule=${res.status}`)
  } catch (err) {
    logError('change-plan', err)
    return fail(req, 503, 'stripe_unavailable', 'Changement momentanément impossible. Réessayez dans un instant.', BACK)
  }
}
