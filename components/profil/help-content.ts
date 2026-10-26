// Chargement des contenus d'aide (Markdown) côté serveur, au build.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import faqIndex from '@/content/faq/index.json'
import tutoIndex from '@/content/tutoriels/index.json'
import { parseMarkdown, type ParsedDoc } from './markdown'

export const FAQ = faqIndex.questions
export const FAQ_CATEGORIES = faqIndex.categories
export const TUTORIELS = tutoIndex.tutoriels

const SAFE_SLUG = /^[a-z0-9-]+$/

async function load(dir: 'faq' | 'tutoriels', slug: string): Promise<ParsedDoc | null> {
  // Le slug provient de l'URL : liste blanche stricte pour éviter toute traversée de chemin.
  if (!SAFE_SLUG.test(slug)) return null
  const known = dir === 'faq' ? FAQ.some(q => q.slug === slug) : TUTORIELS.some(t => t.slug === slug)
  if (!known) return null
  try {
    const src = await readFile(path.join(process.cwd(), 'content', dir, `${slug}.md`), 'utf8')
    return parseMarkdown(src)
  } catch {
    return null
  }
}

export const loadFaq = (slug: string) => load('faq', slug)
export const loadTutoriel = (slug: string) => load('tutoriels', slug)
