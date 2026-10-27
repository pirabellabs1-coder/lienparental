import 'server-only'
/**
 * Modèles publiés, côté serveur (liste « Documents prêts à l'emploi », génération).
 * Base indisponible : liste vide (l'écran parent affiche alors son repli).
 * Langue (`locale`, revalidée) : titre, description, libellés et aides des champs traduits (colonne
 * `translations`) ; le corps et la mise en page restent en français. `lang` = langue affichée.
 */
import { listPublished, PublicReadError } from '@/lib/contenus/public'
import type { ContentLocale } from '@/lib/contenus/locale'
import { parseTemplateBody, type DocumentTemplate } from './template'

export type PublishedTemplate = DocumentTemplate & { id: string; updatedAt: string; pages: number; lang: ContentLocale }
export type PublishedTemplateSummary = Pick<PublishedTemplate, 'id' | 'slug' | 'titre' | 'categorie' | 'description' | 'badge' | 'updatedAt' | 'pages' | 'lang'> & { champs: number }

export async function listPublishedTemplates(locale?: string): Promise<PublishedTemplate[]> {
  try {
    const rows = await listPublished('modele', { locale })
    return rows
      .map((r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt, pages: parseTemplateBody(r.data.corps).length, lang: r.lang ?? 'fr' }))
      .sort((a, b) => Number(b.badge === 'Populaire') - Number(a.badge === 'Populaire') || a.titre.localeCompare(b.titre, a.lang))
  } catch (e) {
    if (e instanceof PublicReadError) return []
    throw e
  }
}

export async function getPublishedTemplate(slug: string, locale?: string): Promise<PublishedTemplate | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  return (await listPublishedTemplates(locale)).find((t) => t.slug === slug) ?? null
}

export function summarize(t: PublishedTemplate): PublishedTemplateSummary {
  return { id: t.id, slug: t.slug, titre: t.titre, categorie: t.categorie, description: t.description, badge: t.badge, updatedAt: t.updatedAt, pages: t.pages, champs: t.champs.length, lang: t.lang }
}
