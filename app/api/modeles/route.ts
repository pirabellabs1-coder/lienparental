/**
 * GET /api/modeles → { data: PublishedTemplateSummary[] }
 * Modèles de documents PUBLIÉS (lecture publique : aucun contenu personnel), dans la langue du cookie
 * `lp_locale` (titre, description traduits ; le document produit reste en français).
 * Réponse dépendante du cookie de langue : cache PRIVÉ (jamais partagé par un CDN entre deux langues).
 */
import { NextResponse } from 'next/server'
import { getLocale } from 'next-intl/server'
import { listPublishedTemplates, summarize } from '@/lib/modeles/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const list = await listPublishedTemplates(await getLocale())
  return NextResponse.json(
    { data: list.map(summarize) },
    { headers: { 'Cache-Control': 'private, max-age=60', Vary: 'Cookie' } },
  )
}
