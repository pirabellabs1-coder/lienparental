/**
 * GET /api/admin/comptes/export?q=&plan=&statut=&du=&au=  → text/csv (10 000 lignes au maximum)
 * Export MINIMISÉ des comptes (ni nom, ni coordonnées, ni santé, ni contenu), cellules protégées
 * contre l'injection de formules. Chaque export est journalisé AVANT l'envoi (admin.account.export).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { adminRoute, apiError } from '@/lib/contenus/api'
import { exportAccountsCsv } from '@/lib/admin/ops/comptes'
import { accountFiltersSchema, flatParams } from '@/lib/admin/ops/types'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    const f = accountFiltersSchema.safeParse(flatParams(Object.fromEntries(req.nextUrl.searchParams)))
    if (!f.success) return apiError(400, 'bad_request', 'Filtres invalides.')
    const who = ctx.mode === 'live' ? ctx.userId : 'demo'
    if (!(await rateLimit(userKey('admin-export', who), 10, 10 * 60_000)).ok) {
      return apiError(429, 'rate_limited', 'Trop d’exports rapprochés : patientez quelques minutes.')
    }
    const { csv, truncated } = await exportAccountsCsv(ctx, f.data)
    const name = `comptes-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
      },
    })
  })
}
