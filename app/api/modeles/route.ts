/**
 * GET /api/modeles → { data: PublishedTemplateSummary[] }
 * Modèles de documents PUBLIÉS (lecture publique : aucun contenu personnel).
 */
import { NextResponse } from 'next/server'
import { listPublishedTemplates, summarize } from '@/lib/modeles/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const list = await listPublishedTemplates()
  return NextResponse.json(
    { data: list.map(summarize) },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
  )
}
