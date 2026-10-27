import 'server-only'
/**
 * Lectures publiques du blog (articles publiés dont la date de publication est passée).
 * Base indisponible : liste vide plutôt qu'une page d'erreur (le blog n'est pas critique).
 * Langue (`locale`, revalidée fr | en | pt) : traduction de la ligne (colonne `translations`) sinon
 * le français, signalé par `lang` (attribut `lang` de l'article). Mémoïsation React par langue.
 */
import { cache } from 'react'
import { listPublished, PublicReadError } from '@/lib/contenus/public'
import { toContentLocale, type ContentLocale } from '@/lib/contenus/locale'
import type { PublishedPost } from './types'

/** Articles publiés dans une langue (sans `locale` : français, ex. sitemap). */
export async function listPosts(locale?: string): Promise<PublishedPost[]> {
  return listPostsCached(toContentLocale(locale))
}

// Clé de cache() = la langue : jamais un article anglais servi à une page française (et inversement).
const listPostsCached = cache(async (locale: ContentLocale): Promise<PublishedPost[]> => {
  try {
    const rows = await listPublished('article', { limit: 500, locale })
    return rows
      .map((r) => ({ ...r.data, id: r.id, publishedAt: r.publishedAt ?? r.createdAt, updatedAt: r.updatedAt, lang: r.lang ?? 'fr' }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  } catch (e) {
    if (e instanceof PublicReadError) return []
    throw e
  }
})

export async function getPost(slug: string, locale?: string): Promise<PublishedPost | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  return (await listPosts(locale)).find((p) => p.slug === slug) ?? null
}

/** Articles proches (même catégorie d'abord, puis étiquettes communes), dans la même langue. */
export async function relatedPosts(post: PublishedPost, n = 3, locale?: string): Promise<PublishedPost[]> {
  const all = (await listPosts(locale)).filter((p) => p.slug !== post.slug)
  const score = (p: PublishedPost) => (p.categorie === post.categorie ? 2 : 0) + p.tags.filter((t) => post.tags.includes(t)).length
  return all.sort((a, b) => score(b) - score(a) || b.publishedAt.localeCompare(a.publishedAt)).slice(0, n)
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://lienparental.fr').replace(/\/+$/, '')
}
