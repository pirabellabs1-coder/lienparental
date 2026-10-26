import 'server-only'
/**
 * Entrées du sitemap pour le blog. À intégrer dans app/sitemap.ts (fichier coordinateur) :
 *
 *   import { blogSitemapEntries } from '@/lib/blog/sitemap'
 *   export default async function sitemap() {
 *     return [...paths.map(...), ...(await blogSitemapEntries(SITE_URL))]
 *   }
 */
import type { MetadataRoute } from 'next'
import { listPosts } from './queries'

export async function blogSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const posts = await listPosts()
  const base = siteUrl.replace(/\/+$/, '')
  const latest = posts[0]?.updatedAt
  return [
    { url: `${base}/blog`, lastModified: latest ? new Date(latest) : new Date(), changeFrequency: 'weekly', priority: 0.7 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.updatedAt || p.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
