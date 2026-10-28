import type { MetadataRoute } from 'next'
import { blogSitemapEntries } from '@/lib/blog/sitemap'
import { loadGuide, type GuideSnapshot } from '@/lib/guide/load'
import { type Locale } from '@/lib/i18n/config'
import { PREFIXED_LOCALES } from '@/lib/i18n/routing'
import { PUBLIC_PAGES, isoDate } from '@/lib/seo/pages'
import { guidePaths } from '@/lib/seo/site'
import { localizedEntries } from '@/lib/seo/sitemap-i18n'

// Contenus administrables (blog, Guide) relus à chaque demande : dates de modification à jour.
export const dynamic = 'force-dynamic'

const latest = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), dates[0] ?? '')

/**
 * Guide parental public (territoire par défaut) : index, territoire, fiches, catégories utilisées et
 * parcours, datés par `derniereVerification`. Pages de liste : trois langues ; fiches et parcours :
 * seulement les langues où ils sont réellement traduits. Jamais `/app/guide` (espace connecté).
 */
async function guideEntries(): Promise<MetadataRoute.Sitemap> {
  const g = await loadGuide(undefined, 'fr')
  if (g.fiches.length === 0) return []
  const code = g.territoire.code
  const translations = await Promise.all(PREFIXED_LOCALES.map(async (l) => [l, await loadGuide(code, l)] as const))
  const translatedIn = (pick: (s: GuideSnapshot) => { slug: string; lang?: string }[], slug: string): Locale[] => [
    'fr',
    ...translations.filter(([l, s]) => pick(s).find((x) => x.slug === slug)?.lang === l).map(([l]) => l),
  ]
  const dateOf = new Map(g.fiches.map((f) => [f.slug, f.derniereVerification]))
  const newest = latest(g.fiches.map((f) => f.derniereVerification))
  const categories = [...new Set(g.fiches.map((f) => f.categorie))]
  return [
    ...localizedEntries(guidePaths.index, { lastModified: isoDate(newest), changeFrequency: 'weekly', priority: 0.8 }),
    ...localizedEntries(guidePaths.territoire(code), { lastModified: isoDate(newest), changeFrequency: 'weekly', priority: 0.8 }),
    ...g.fiches.flatMap((f) => localizedEntries(
      guidePaths.fiche(code, f.slug),
      { lastModified: isoDate(f.derniereVerification), changeFrequency: 'monthly', priority: 0.7 },
      translatedIn((s) => s.fiches, f.slug),
    )),
    ...categories.flatMap((cat) => localizedEntries(
      guidePaths.categorie(code, cat),
      { lastModified: isoDate(latest(g.fiches.filter((f) => f.categorie === cat).map((f) => f.derniereVerification))), changeFrequency: 'monthly', priority: 0.6 },
    )),
    ...g.parcours.flatMap((p) => {
      const linked = p.elements.flatMap((e) => (e.fiche && dateOf.has(e.fiche) ? [dateOf.get(e.fiche)!] : []))
      return localizedEntries(
        guidePaths.parcours(code, p.slug),
        { lastModified: isoDate(latest(linked) || newest), changeFrequency: 'monthly', priority: 0.6 },
        translatedIn((s) => s.parcours, p.slug),
      )
    }),
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [blog, guide] = await Promise.all([
    blogSitemapEntries(),
    guideEntries().catch((e) => {
      console.warn('[sitemap] Guide indisponible :', e instanceof Error ? e.message : e)
      return []
    }),
  ])
  return [
    // Pages d'interface (entièrement traduites) : une entrée par langue, avec hreflang.
    ...PUBLIC_PAGES.flatMap(({ path, lastModified, priority, changeFrequency }) =>
      localizedEntries(path, { lastModified: isoDate(lastModified), changeFrequency, priority })),
    ...guide,
    ...blog,
  ]
}
