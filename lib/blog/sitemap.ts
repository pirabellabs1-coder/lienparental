import 'server-only'
/**
 * Entrées du sitemap pour le blog (intégrées par app/sitemap.ts) : la liste dans les trois langues,
 * et chaque article dans les langues où il est RÉELLEMENT traduit (jamais une version en repli
 * français), avec ses hreflang.
 */
import type { MetadataRoute } from 'next'
import { locales, type Locale } from '@/lib/i18n/config'
import { localizedEntries } from '@/lib/seo/sitemap-i18n'
import { listPosts } from './queries'

export async function blogSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const byLocale = await Promise.all(locales.map(async (l) => [l, await listPosts(l)] as const))
  const posts = byLocale.find(([l]) => l === 'fr')?.[1] ?? []
  const translated = (slug: string): Locale[] =>
    byLocale.filter(([l, list]) => list.find((p) => p.slug === slug)?.lang === l).map(([l]) => l)
  const latest = posts[0]?.updatedAt
  return [
    ...localizedEntries('/blog', { lastModified: latest ? new Date(latest) : new Date(), changeFrequency: 'weekly', priority: 0.7 }),
    ...posts.flatMap((p) => localizedEntries(
      `/blog/${p.slug}`,
      { lastModified: new Date(p.updatedAt || p.publishedAt), changeFrequency: 'monthly', priority: 0.6 },
      translated(p.slug),
    )),
  ]
}
