import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import { parseCycleStrict } from '@/lib/billing/prices'
import { applyDemoAction, DEMO_BILLING_COOKIE, DEMO_BILLING_MAX_AGE, serializeDemoBilling, type DemoAction } from '@/lib/billing/demo-core'
import { DEMO_BILLING, demoBillingCookieValue, getDemoBilling } from '@/lib/billing/demo'
import { getCurrentUser } from '@/lib/auth/session'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { BILLING_RATE_LIMITS } from '@/lib/billing/limits'
import { apiError, readBody } from '@/lib/billing/http'
import { rejectCrossSiteJson } from '@/lib/data/server/http'

/**
 * POST /api/stripe/demo : abonnement SIMULÉ des comptes de démonstration.
 * `{ action: 'subscribe' | 'change', formule, cycle }` ou `{ action: 'cancel' | 'resume' | 'reset' }`.
 * N'existe qu'en mode démonstration (aucune clé Supabase) : 404 sinon. Aucun appel Stripe.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseAction(body: Record<string, unknown>): DemoAction | null {
  const a = body.action
  if (a === 'cancel' || a === 'resume' || a === 'reset') return { action: a }
  if (a === 'subscribe' || a === 'change') {
    const cycle = parseCycleStrict(body.cycle)
    const formule = body.formule === 'premium' || body.formule === 'coparentalite' ? body.formule : null
    return cycle && formule ? { action: a, formule, cycle } : null
  }
  return null
}

export async function POST(req: Request) {
  const t = await getTranslations('server.stripe')
  if (!DEMO_BILLING) return apiError(404, 'not_found', t('notFound'))
  // JSON + même origine (garde partagée lib/data/server/http.ts).
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected

  const user = await getCurrentUser()
  const current = await getDemoBilling()
  if (!user || !current) return apiError(401, 'unauthenticated', t('signInRequired'))

  const { limit, windowMs } = BILLING_RATE_LIMITS.demo
  const rl = await rateLimit(userKey('billing:demo', user.id), limit, windowMs)
  if (!rl.ok) return rateLimitedResponse(rl)

  const action = parseAction(await readBody(req))
  if (!action) return apiError(400, 'invalid_body', t('invalidBody'))
  const next = applyDemoAction(current, action)
  if (!next) return apiError(409, 'invalid_state', t('invalidState'))

  const value = await demoBillingCookieValue(serializeDemoBilling(next))
  if (!value) return apiError(401, 'unauthenticated', t('signInRequired'))
  const res = NextResponse.json({ ok: true, plan: next.plan, cycle: next.cycle, cancel_at_period_end: next.cancelAtPeriodEnd }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set(DEMO_BILLING_COOKIE, value, {
    path: '/',
    maxAge: DEMO_BILLING_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(req.url).protocol === 'https:',
  })
  return res
}
