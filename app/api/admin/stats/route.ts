import { NextResponse } from 'next/server'
import { getDashboard, parsePeriod } from '@/lib/admin/stats'
import { requireAdmin } from '@/lib/admin/stats/guard'

/**
 * GET /api/admin/stats?periode=7j|30j|90j|12m|perso[&du=yyyy-mm-dd&au=yyyy-mm-dd]
 * 200 DashboardData (agrégats + listes minimisées : prénom + initiale).
 * 400 période invalide · 401 / 403 garde admin · 503 statistiques indisponibles.
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
  return NextResponse.json(result.data, { headers: NO_STORE })
}
