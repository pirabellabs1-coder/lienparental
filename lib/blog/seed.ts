import 'server-only'
/**
 * Articles de démonstration : `content/blog/<slug>.md` (en-tête « clé: valeur » + Markdown).
 * Servent de contenu du mode démonstration et de semences pour scripts/seed-contenus-sql.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { blogPostSchema, type BlogPost } from './types'
import { parseFrontmatter } from './frontmatter'

const DIR = path.join(process.cwd(), 'content', 'blog')

export type SeedPost = { post: BlogPost; publishedAt: string; statut: 'publie' | 'brouillon' }

export function readSeedPosts(): SeedPost[] {
  if (!fs.existsSync(DIR)) return []
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((f) => {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(DIR, f), 'utf8'))
      const parsed = blogPostSchema.safeParse({
        slug: f.replace(/\.md$/, ''),
        titre: meta.titre,
        extrait: meta.extrait,
        contenu: body,
        couverture: meta.couverture ?? '',
        couvertureAlt: meta.couvertureAlt ?? '',
        categorie: meta.categorie,
        tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        auteur: meta.auteur,
        seoTitre: meta.seoTitre ?? '',
        seoDescription: meta.seoDescription ?? '',
      })
      if (!parsed.success) {
        console.warn(`[blog] content/blog/${f} ignoré : ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`)
        return []
      }
      const date = /^\d{4}-\d{2}-\d{2}/.test(meta.date ?? '') ? meta.date : '2026-10-01'
      return [{ post: parsed.data, publishedAt: new Date(`${date.slice(0, 10)}T08:00:00Z`).toISOString(), statut: meta.statut === 'brouillon' ? 'brouillon' : 'publie' }]
    })
}
