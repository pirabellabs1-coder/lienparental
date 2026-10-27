import { NextResponse } from 'next/server'
import { apiError, limitBilling, logError, requireBillingUser } from '@/lib/billing/http'
import { listInvoices } from '@/lib/billing/overview'

/**
 * GET /api/stripe/invoices?limit=12&cursor=in_... — factures Stripe de l'utilisateur.
 * 200 `{ data: InvoiceItem[], page: { next_cursor, has_more } }` (liens hosted_invoice_url + invoice_pdf).
 * Toujours filtré sur le customer Stripe enregistré pour l'utilisateur authentifié.
 * 400 invalid_cursor · 401 · 503
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireBillingUser()
  if ('error' in auth) return apiError(auth.error.status, auth.error.code, auth.error.message)
  const limited = await limitBilling('invoices', auth.user.id)
  if (limited) return limited

  const params = new URL(req.url).searchParams
  const limitRaw = Number.parseInt(params.get('limit') ?? '12', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 12
  const cursor = params.get('cursor')
  if (cursor && !/^in_[A-Za-z0-9]{6,64}$/.test(cursor)) return apiError(400, 'invalid_cursor', 'Curseur invalide.')

  try {
    const page = await listInvoices(auth.user.id, { limit, startingAfter: cursor })
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    logError('invoices', err)
    return apiError(503, 'stripe_unavailable', 'Factures momentanément indisponibles.')
  }
}
