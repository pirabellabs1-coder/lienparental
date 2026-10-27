/**
 * GET /api/aide/conseils → { data: DailyTipItem[] }
 * Conseils du jour PUBLIÉS (lecture publique : contenu éditorial, aucune donnée personnelle).
 * Source : lib/aide/public.getDailyTips (Supabase, démonstration ou repli sur le dépôt), dans la
 * langue du cookie `lp_locale` (getLocale, revalidée fr | en | pt) ; catégorie traduite par le catalogue.
 * Réponse dépendante du cookie de langue : cache PRIVÉ (jamais partagé par un CDN entre deux langues).
 */
import { NextResponse } from 'next/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { getDailyTips } from '@/lib/aide/public'

export const dynamic = 'force-dynamic'

export async function GET() {
  const locale = await getLocale()
  const t = await getTranslations('dash.tipCategory')
  const tips = await getDailyTips(locale, (key) => t(key))
  return NextResponse.json(
    { data: tips },
    { headers: { 'Cache-Control': 'private, max-age=60', Vary: 'Cookie' } },
  )
}
