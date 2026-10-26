/**
 * Génère le SQL de semences des contenus administrables (migration 0300_admin_contenus.sql)
 * à partir des fichiers du dépôt :
 *   - content/guide/<territoire>/ : territoire, fiches et parcours → PUBLIÉS (contenu déjà relu et sourcé)
 *   - lib/modeles/seeds.ts        : modèles de documents         → BROUILLONS (à relire)
 *   - content/blog/*.md           : articles                     → BROUILLONS (à relire)
 * Rien n'est écrasé (`on conflict do nothing`) : relançable sans risque.
 *
 * Usage : npx --yes tsx scripts/seed-contenus-sql.ts > supabase/seed_contenus.sql
 * puis exécuter le fichier dans Supabase (SQL Editor) APRÈS 0300_admin_contenus.sql.
 * Alternative sans script : bouton « Importer depuis le dépôt » dans /admin/guides, /admin/modeles, /admin/blog.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ficheSchema, parcoursSchema, territoireSchema } from '../lib/guide/types'
import { SEED_TEMPLATES } from '../lib/modeles/seeds'
import { blogPostSchema } from '../lib/blog/types'
import { parseFrontmatter } from '../lib/blog/frontmatter'
import { TABLE, toRow } from '../lib/contenus/rows'
import type { ContentData, ContentKind, ContentStatus } from '../lib/contenus/types'

const ROOT = process.cwd()
const q = (v: string) => `'${v.replace(/'/g, "''")}'`

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return `array[${v.map((x) => q(x)).join(', ')}]::text[]`
  if (typeof v === 'object') return `${q(JSON.stringify(v))}::jsonb`
  return q(String(v))
}

function insert<K extends ContentKind>(kind: K, data: ContentData[K], statut: ContentStatus, publishedAt: string | null, conflict: string) {
  const row = toRow(kind, data, statut, publishedAt)
  if (kind === 'article') row.tags = (data as ContentData['article']).tags // text[]
  const cols = Object.keys(row)
  const vals = cols.map((c) => (c === 'tags' ? `array[${(row.tags as string[]).map(q).join(', ')}]::text[]` : lit(row[c])))
  return `insert into public.${TABLE[kind]} (${cols.join(', ')}) values (${vals.join(', ')}) on conflict ${conflict} do nothing;`
}

const out: string[] = [
  '-- Semences générées par scripts/seed-contenus-sql.ts : ne pas modifier à la main.',
  `-- ${new Date().toISOString()}`,
  'begin;',
]
const now = new Date().toISOString()

const guideDir = path.join(ROOT, 'content', 'guide')
for (const code of fs.readdirSync(guideDir).filter((d) => fs.statSync(path.join(guideDir, d)).isDirectory()).sort()) {
  const dir = path.join(guideDir, code)
  const t = territoireSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'territoire.json'), 'utf8')))
  out.push(`\n-- Territoire ${t.code}`)
  out.push(`insert into public.guide_territoires (code, nom, disponible, ordre) values (${q(t.code)}, ${q(t.nom)}, ${t.disponible}, ${t.ordre}) on conflict (code) do nothing;`)
  const read = (sub: string) => {
    const d = path.join(dir, sub)
    return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) : []
  }
  for (const raw of read('fiches')) out.push(insert('fiche', ficheSchema.parse(raw), 'publie', now, '(territoire, slug)'))
  for (const raw of read('parcours')) out.push(insert('parcours', parcoursSchema.parse(raw), 'publie', now, '(territoire, slug)'))
}

out.push('\n-- Modèles de documents (brouillons à relire avant publication)')
for (const t of SEED_TEMPLATES) out.push(insert('modele', t, 'brouillon', null, '(slug)'))

out.push('\n-- Articles du blog (brouillons à relire avant publication)')
const blogDir = path.join(ROOT, 'content', 'blog')
if (fs.existsSync(blogDir)) {
  for (const f of fs.readdirSync(blogDir).filter((x) => x.endsWith('.md')).sort()) {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(blogDir, f), 'utf8'))
    const post = blogPostSchema.parse({
      slug: f.replace(/\.md$/, ''), titre: meta.titre, extrait: meta.extrait, contenu: body,
      couverture: meta.couverture ?? '', couvertureAlt: meta.couvertureAlt ?? '', categorie: meta.categorie,
      tags: (meta.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean), auteur: meta.auteur,
      seoTitre: meta.seoTitre ?? '', seoDescription: meta.seoDescription ?? '',
    })
    out.push(insert('article', post, 'brouillon', null, '(slug)'))
  }
}

out.push('commit;')
process.stdout.write(`${out.join('\n')}\n`)
