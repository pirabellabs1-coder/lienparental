import type { MetadataRoute } from 'next'
import { blogSitemapEntries } from '@/lib/blog/sitemap'
import { listAvailableTerritoires, loadGuide, type GuideSnapshot } from '@/lib/guide/load'
import { type Locale } from '@/lib/i18n/config'
import { PREFIXED_LOCALES } from '@/lib/i18n/routing'
import { PUBLIC_PAGES, isoDate } from '@/lib/seo/pages'
import { guidePaths } from '@/lib/seo/site'
import { localizedEntries } from '@/lib/seo/sitemap-i18n'

// Contenus administrables (blog, Guide) relus à chaque demande : dates de modification à jour.
export const dynamic = 'force-dynamic'

const latest = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), dates[0] ?? '')

/**
 * Guide parental public, TOUS les territoires disponibles : index, territoire, fiches, catégories utilisées
 * et parcours, datés par `derniereVerification`. Pages de liste : trois langues ; fiches et parcours :
 * seulement les langues où ils sont réellement traduits. Jamais `/app/guide` (espace connecté).
 */
async function territoryEntries(code: string): Promise<{ entries: MetadataRoute.Sitemap; newest: string }> {
  const g = await loadGuide(code, 'fr')
  // loadGuide retombe sur le territoire par défaut si `code` n'est plus disponible : on ne le compte qu'une fois.
  if (g.territoire.code !== code || g.fiches.length === 0) return { entries: [], newest: '' }
  const translations = await Promise.all(PREFIXED_LOCALES.map(async (l) => [l, await loadGuide(code, l)] as const))
  const translatedIn = (pick: (s: GuideSnapshot) => { slug: string; lang?: string }[], slug: string): Locale[] => [
    'fr',
    ...translations.filter(([l, s]) => pick(s).find((x) => x.slug === slug)?.lang === l).map(([l]) => l),
  ]
  const dateOf = new Map(g.fiches.map((f) => [f.slug, f.derniereVerification]))
  const newest = latest(g.fiches.map((f) => f.derniereVerification))
  const categories = [...new Set(g.fiches.map((f) => f.categorie))]
  const entries: MetadataRoute.Sitemap = [
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
  return { entries, newest }
}

async function guideEntries(): Promise<MetadataRoute.Sitemap> {
  const territoires = await listAvailableTerritoires('fr')
  const parts = await Promise.all(territoires.map((t) => territoryEntries(t.code).catch((e) => {
    console.warn(`[sitemap] Guide « ${t.code} » indisponible :`, e instanceof Error ? e.message : e)
    return { entries: [], newest: '' }
  })))
  const withContent = parts.filter((p) => p.entries.length)
  if (!withContent.length) return []
  const newest = latest(withContent.map((p) => p.newest))
  return [
    ...localizedEntries(guidePaths.index, { lastModified: isoDate(newest), changeFrequency: 'weekly', priority: 0.8 }),
    ...withContent.flatMap((p) => p.entries),
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
