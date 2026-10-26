/**
 * Blog : schéma d'un article (module PUR, isomorphe).
 * Le contenu est du Markdown rendu par lib/blog/markdown.tsx (jamais de HTML brut).
 */
import { z } from 'zod'

export const BLOG_CATEGORIES = [
  { key: 'coparentalite', label: 'Coparentalité' },
  { key: 'demarches', label: 'Démarches' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'enfant', label: 'Bien-être de l’enfant' },
  { key: 'application', label: 'Lien Parental' },
] as const
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]['key']
const CATEGORY_KEYS = BLOG_CATEGORIES.map((c) => c.key) as [BlogCategory, ...BlogCategory[]]

export function blogCategoryLabel(key: string): string {
  return BLOG_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

const text = (max: number) => z.string().trim().min(1, 'Champ obligatoire.').max(max, `${max} caractères au maximum.`)

/** Image : chemin local (/images/…) ou URL https (bucket Supabase public `blog-images`). */
export const imageUrlSchema = z.string().trim().max(500).refine(
  (v) => v === '' || /^\/(?!\/)[\w\-./]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v),
  'Image : chemin /images/… ou adresse https.',
)

export const blogPostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug : minuscules, chiffres et tirets.').max(80),
  titre: text(140),
  extrait: text(320),
  contenu: text(60000),
  couverture: imageUrlSchema.default(''),
  couvertureAlt: z.string().trim().max(200).default(''),
  categorie: z.enum(CATEGORY_KEYS),
  tags: z.array(z.string().trim().min(1).max(32)).max(10, '10 étiquettes au maximum.').default([]),
  auteur: text(80),
  seoTitre: z.string().trim().max(70, '70 caractères au maximum (au-delà, Google tronque).').default(''),
  seoDescription: z.string().trim().max(170, '170 caractères au maximum.').default(''),
}).superRefine((p, ctx) => {
  if (p.couverture && !p.couvertureAlt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['couvertureAlt'], message: 'Décrivez l’image (texte alternatif) pour les personnes malvoyantes.' })
  }
})
export type BlogPost = z.output<typeof blogPostSchema>

/** Article publié tel qu'affiché par les pages publiques. */
export type PublishedPost = BlogPost & { id: string; publishedAt: string; updatedAt: string }

export function emptyPost(): BlogPost {
  return {
    slug: 'nouvel-article',
    titre: 'Nouvel article',
    extrait: 'Résumé en une ou deux phrases, affiché dans la liste des articles et sur les réseaux sociaux.',
    contenu: '## Introduction\n\nCommencez ici.',
    couverture: '',
    couvertureAlt: '',
    categorie: 'coparentalite',
    tags: [],
    auteur: 'L’équipe Lien Parental',
    seoTitre: '',
    seoDescription: '',
  }
}
