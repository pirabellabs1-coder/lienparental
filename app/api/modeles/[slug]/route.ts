/**
 * GET /api/modeles/[slug] → { data: PublishedTemplate } | 404
 * Modèle publié complet (champs, corps, mise en page) pour la génération côté navigateur.
 */
import { NextResponse } from 'next/server'
import { getPublishedTemplate } from '@/lib/modeles/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getPublishedTemplate(slug)
  if (!t) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Modèle introuvable ou non publié.' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return NextResponse.json({ data: t }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } })
}
