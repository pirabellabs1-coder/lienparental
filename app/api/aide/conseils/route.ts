/**
 * GET /api/aide/conseils → { data: Tip[] }
 * Conseils du jour PUBLIÉS (lecture publique : contenu éditorial, aucune donnée personnelle).
 * Source : lib/aide/public.getDailyTips (Supabase, démonstration ou repli sur le dépôt).
 */
import { NextResponse } from 'next/server'
import { getDailyTips } from '@/lib/aide/public'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tips = await getDailyTips()
  return NextResponse.json(
    { data: tips },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
  )
}
