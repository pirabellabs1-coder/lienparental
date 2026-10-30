/**
 * Articles de blog du dépôt (content/blog + content/i18n/{en,pt}/blog) : schéma valide, traduction EN/PT
 * réellement servie (pas de repli silencieux sur le français), longueurs SEO, et liens internes qui
 * mènent tous à une page existante (fiche, parcours ou territoire du Guide, autre article).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { blogPostSchema } from '../lib/blog/types'
import { parseFrontmatter } from '../lib/blog/frontmatter'
import { localizeFromFiles } from '../lib/contenus/i18n-files'

const ROOT = process.cwd()
const BLOG = path.join(ROOT, 'content/blog')
const slugs = fs.readdirSync(BLOG).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))

function frPost(slug: string) {
  const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(BLOG, `${slug}.md`), 'utf8'))
  return blogPostSchema.parse({
    slug, titre: meta.titre, extrait: meta.extrait, contenu: body, couverture: meta.couverture ?? '',
    couvertureAlt: meta.couvertureAlt ?? '', categorie: meta.categorie,
    tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean), auteur: meta.auteur,
    seoTitre: meta.seoTitre ?? '', seoDescription: meta.seoDescription ?? '',
  })
}

/** Chemin interne (sans préfixe de langue) → la page existe-t-elle dans le dépôt ? */
function exists(href: string): boolean {
  const p = href.replace(/[?#].*$/, '')
  if (p === '/guide' || p === '/blog' || p === '/') return true
  let m = /^\/blog\/([a-z0-9-]+)$/.exec(p)
  if (m) return slugs.includes(m[1])
  m = /^\/guide\/([a-z0-9-]+)$/.exec(p)
  if (m) return fs.existsSync(path.join(ROOT, 'content/guide', m[1], 'territoire.json'))
  m = /^\/guide\/([a-z0-9-]+)\/parcours\/([a-z0-9-]+)$/.exec(p)
  if (m) return fs.existsSync(path.join(ROOT, 'content/guide', m[1], 'parcours', `${m[2]}.json`))
  m = /^\/guide\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(p)
  if (m) return fs.existsSync(path.join(ROOT, 'content/guide', m[1], 'fiches', `${m[2]}.json`))
  return false
}

test('chaque article français respecte le schéma (titre SEO ≤ 70, description ≤ 170)', () => {
  assert.ok(slugs.length >= 7)
  for (const slug of slugs) assert.doesNotThrow(() => frPost(slug), slug)
})

test('chaque article est réellement traduit en anglais et en portugais', () => {
  for (const slug of slugs) {
    for (const locale of ['en', 'pt'] as const) {
      const { lang, data } = localizeFromFiles('article', frPost(slug), locale)
      assert.equal(lang, locale, `${locale}/${slug} : traduction absente ou invalide`)
      assert.notEqual(data.titre, frPost(slug).titre, `${locale}/${slug} : titre non traduit`)
    }
  }
})

test('les liens internes du blog (FR, EN, PT) mènent à des pages existantes', () => {
  const files = [
    ...slugs.map((s) => path.join(BLOG, `${s}.md`)),
    ...['en', 'pt'].flatMap((l) => slugs.map((s) => path.join(ROOT, `content/i18n/${l}/blog/${s}.md`))).filter((f) => fs.existsSync(f)),
  ]
  let count = 0
  for (const f of files) {
    for (const [, href] of fs.readFileSync(f, 'utf8').matchAll(/\]\((\/[^)\s]*)\)/g)) {
      count++
      assert.ok(exists(href), `${path.relative(ROOT, f)} : lien mort ${href}`)
    }
  }
  assert.ok(count > 40, `${count} liens internes`)
})

test('aucun article ne promet un chiffrement de bout en bout', () => {
  for (const f of slugs.flatMap((s) => [`content/blog/${s}.md`, `content/i18n/en/blog/${s}.md`, `content/i18n/pt/blog/${s}.md`])) {
    if (fs.existsSync(path.join(ROOT, f))) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /bout en bout|end-to-end|ponta a ponta/i, f)
  }
})
