import { NextResponse } from 'next/server'
import { apiError, fail, isSameOrigin, logError, readBody, requireBillingUser, seeOther, wantsJson } from '@/lib/billing/http'
import { setCancelAtPeriodEnd } from '@/lib/billing/manage'

/**
 * POST /api/stripe/cancel — `{ "cancel": true }` résilie en fin de période,
 * `{ "cancel": false }` annule la résiliation. Idempotent (même état → même réponse).
 *  - 200 `{ cancel_at_period_end, current_period_end }`
 *  - 400 invalid_body · 401 · 403 · 409 no_subscription · 503
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACK = '/app/profil/abonnement'

function parseCancel(v: unknown): boolean | null {
  if (v === undefined) return true
  if (v === true || v === 'true' || v === '1') return true
  if (v === false || v === 'false' || v === '0') return false
  return null
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return apiError(403, 'invalid_origin', 'Requête refusée.')
  const auth = await requireBillingUser()
  if ('error' in auth) return fail(req, auth.error.status, auth.error.code, auth.error.message, BACK)

  const cancel = parseCancel((await readBody(req)).cancel)
  if (cancel === null) return fail(req, 400, 'invalid_body', 'Requête invalide.', BACK)

  try {
    const res = await setCancelAtPeriodEnd(auth.user.id, cancel)
    if (!res.ok) return fail(req, res.status, res.code, res.message, BACK)
    if (wantsJson(req)) {
      return NextResponse.json(
        { cancel_at_period_end: res.cancel_at_period_end, current_period_end: res.current_period_end },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return seeOther(BACK)
  } catch (err) {
    logError('cancel', err)
    return fail(req, 503, 'stripe_unavailable', 'Opération momentanément impossible. Réessayez dans un instant.', BACK)
  }
}
