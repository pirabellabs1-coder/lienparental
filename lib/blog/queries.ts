import 'server-only'
/**
 * Lectures publiques du blog (articles publiés dont la date de publication est passée).
 * Base indisponible : liste vide plutôt qu'une page d'erreur (le blog n'est pas critique).
 */
import { cache } from 'react'
import { listPublished, PublicReadError } from '@/lib/contenus/public'
import type { PublishedPost } from './types'

export const listPosts = cache(async (): Promise<PublishedPost[]> => {
  try {
    const rows = await listPublished('article', { limit: 500 })
    return rows
      .map((r) => ({ ...r.data, id: r.id, publishedAt: r.publishedAt ?? r.createdAt, updatedAt: r.updatedAt }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  } catch (e) {
    if (e instanceof PublicReadError) return []
    throw e
  }
})

export async function getPost(slug: string): Promise<PublishedPost | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  return (await listPosts()).find((p) => p.slug === slug) ?? null
}

/** Articles proches (même catégorie d'abord, puis étiquettes communes). */
export async function relatedPosts(post: PublishedPost, n = 3): Promise<PublishedPost[]> {
  const all = (await listPosts()).filter((p) => p.slug !== post.slug)
  const score = (p: PublishedPost) => (p.categorie === post.categorie ? 2 : 0) + p.tags.filter((t) => post.tags.includes(t)).length
  return all.sort((a, b) => score(b) - score(a) || b.publishedAt.localeCompare(a.publishedAt)).slice(0, n)
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://lienparental.fr').replace(/\/+$/, '')
}
