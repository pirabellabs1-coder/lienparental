import 'server-only'
/**
 * Semences du centre d'aide : contenus versionnés dans le dépôt.
 *  - FAQ : content/faq/index.json + content/faq/<slug>.md
 *  - Tutoriels : content/tutoriels/index.json + content/tutoriels/<slug>.md
 *  - Conseils du jour : lib/mock-data.ts (mockTips)
 * Servent de contenu en démonstration et d'import initial en base (bouton « Importer depuis le dépôt »).
 * Une entrée invalide ou sans fichier est ignorée (avertissement serveur), jamais inventée.
 *
 * `locale` (en, pt) : superpose les traductions de content/i18n/<locale>/… (docs/I18N-CONTENU.md),
 * élément par élément ; sans traduction valide, l'élément reste en français.
 */
import fs from 'node:fs'
import path from 'node:path'
import faqIndex from '@/content/faq/index.json'
import tutoIndex from '@/content/tutoriels/index.json'
import { mockTips } from '@/lib/mock-data'
import { parseFrontmatter } from '@/lib/blog/frontmatter'
import { slugify } from '@/lib/contenus/types'
import type { ContentLocale } from '@/lib/contenus/i18n'
import { localizeFromFiles } from '@/lib/contenus/i18n-files'
import { conseilSchema, faqSchema, tutorielSchema, type Conseil, type FaqItem, type TipCategory, type Tutoriel } from './types'

const SAFE = /^[a-z0-9-]+$/

function readBody(dir: 'faq' | 'tutoriels', slug: string): string | null {
  if (!SAFE.test(slug)) return null
  const file = path.join(process.cwd(), 'content', dir, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  return parseFrontmatter(fs.readFileSync(file, 'utf8')).body
}

export function readSeedFaq(locale: ContentLocale = 'fr'): FaqItem[] {
  return frFaq().map((f) => localizeFromFiles('faq', f, locale).data)
}

function frFaq(): FaqItem[] {
  return faqIndex.questions.flatMap((q, i) => {
    const body = readBody('faq', q.slug)
    if (!body) return []
    const r = faqSchema.safeParse({ slug: q.slug, question: q.question, categorie: q.categoryKey, reponse: body, ordre: (i + 1) * 10 })
    if (!r.success) {
      console.warn(`[aide] content/faq/${q.slug}.md ignoré : contenu invalide`)
      return []
    }
    return [r.data]
  })
}

const ICON: Record<string, Tutoriel['icone']> = {
  rocket: 'rocket', sparkles: 'sparkles', upload: 'upload', 'user-check': 'user-check', 'folder-down': 'folder-down', star: 'star',
}

export function readSeedTutoriels(locale: ContentLocale = 'fr'): Tutoriel[] {
  return frTutoriels().map((t) => localizeFromFiles('tutoriel', t, locale).data)
}

function frTutoriels(): Tutoriel[] {
  return tutoIndex.tutoriels.flatMap((t, i) => {
    const body = readBody('tutoriels', t.slug)
    if (!body) return []
    const r = tutorielSchema.safeParse({
      slug: t.slug, titre: t.title, resume: '', dureeMin: t.duree_min, icone: ICON[t.coverIcon] ?? 'rocket', contenu: body, ordre: (i + 1) * 10,
    })
    if (!r.success) {
      console.warn(`[aide] content/tutoriels/${t.slug}.md ignoré : contenu invalide`)
      return []
    }
    return [r.data]
  })
}

const TAG: Record<string, TipCategory> = { Communication: 'communication', Preuves: 'preuves', Enfant: 'enfant', Organisation: 'organisation' }

export function readSeedConseils(locale: ContentLocale = 'fr'): Conseil[] {
  return frConseils().map((c) => localizeFromFiles('conseil', c, locale).data)
}

function frConseils(): Conseil[] {
  return mockTips.flatMap((t, i) => {
    const r = conseilSchema.safeParse({
      slug: slugify(t.title, 80) || `conseil-${i + 1}`,
      titre: t.title,
      texte: t.body,
      categorie: TAG[t.tag] ?? 'organisation',
      ordre: (i + 1) * 10,
    })
    return r.success ? [r.data] : []
  })
}
