import type { MetadataRoute } from 'next'
import { blogSitemapEntries } from '@/lib/blog/sitemap'
import { loadGuide } from '@/lib/guide/load'
import { PUBLIC_PAGES, isoDate } from '@/lib/seo/pages'
import { SITE, abs, guidePaths } from '@/lib/seo/site'

// Contenus administrables (blog, Guide) relus à chaque demande : dates de modification à jour.
export const dynamic = 'force-dynamic'

const latest = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), dates[0] ?? '')

/**
 * Guide parental public (territoire par défaut, version française de référence) :
 * index, territoire, fiches, catégories utilisées et parcours, datés par `derniereVerification`.
 * Jamais `/app/guide` (espace connecté, non indexé).
 */
async function guideEntries(): Promise<MetadataRoute.Sitemap> {
  const g = await loadGuide(undefined, 'fr')
  if (g.fiches.length === 0) return []
  const code = g.territoire.code
  const dateOf = new Map(g.fiches.map((f) => [f.slug, f.derniereVerification]))
  const newest = latest(g.fiches.map((f) => f.derniereVerification))
  const categories = [...new Set(g.fiches.map((f) => f.categorie))]
  return [
    { url: abs(guidePaths.index), lastModified: isoDate(newest), changeFrequency: 'weekly', priority: 0.8 },
    { url: abs(guidePaths.territoire(code)), lastModified: isoDate(newest), changeFrequency: 'weekly', priority: 0.8 },
    ...g.fiches.map((f) => ({ url: abs(guidePaths.fiche(code, f.slug)), lastModified: isoDate(f.derniereVerification), changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...categories.map((cat) => ({
      url: abs(guidePaths.categorie(code, cat)),
      lastModified: isoDate(latest(g.fiches.filter((f) => f.categorie === cat).map((f) => f.derniereVerification))),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...g.parcours.map((p) => {
      const linked = p.elements.flatMap((e) => (e.fiche && dateOf.has(e.fiche) ? [dateOf.get(e.fiche)!] : []))
      return { url: abs(guidePaths.parcours(code, p.slug)), lastModified: isoDate(latest(linked) || newest), changeFrequency: 'monthly' as const, priority: 0.6 }
    }),
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [blog, guide] = await Promise.all([
    blogSitemapEntries(SITE),
    guideEntries().catch((e) => {
      console.warn('[sitemap] Guide indisponible :', e instanceof Error ? e.message : e)
      return []
    }),
  ])
  return [
    ...PUBLIC_PAGES.map(({ path, lastModified, priority, changeFrequency }) => ({ url: abs(path), lastModified: isoDate(lastModified), changeFrequency, priority })),
    ...guide,
    ...blog,
  ]
}
