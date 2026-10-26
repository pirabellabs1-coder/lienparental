import { NextResponse } from 'next/server'
import { getDashboard, parsePeriod } from '@/lib/admin/stats'
import { requireAdmin } from '@/lib/admin/stats/guard'
import { dashboardCsv } from '@/lib/admin/stats/csv'

/**
 * GET /api/admin/stats/export?periode=…[&du=…&au=…] — export CSV des agrégats
 * (aucune donnée nominative). Mêmes paramètres et mêmes gardes que /api/admin/stats.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status, headers: NO_STORE })

  const { period, error } = parsePeriod(Object.fromEntries(new URL(req.url).searchParams))
  if (error) return NextResponse.json({ error }, { status: 400, headers: NO_STORE })

  const result = await getDashboard(period)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503, headers: NO_STORE })

  const suffix = result.data.source === 'demo' ? '-demo' : ''
  const filename = `lien-parental-statistiques-${period.fromDay}_${period.toDay}${suffix}.csv`
  return new NextResponse(dashboardCsv(result.data), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
