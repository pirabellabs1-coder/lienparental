/**
 * Contrôle des traductions du contenu éditorial (content/i18n/<locale>/…).
 *
 *   npx tsx scripts/check-content-i18n.ts            → toutes les langues, tous les fichiers
 *   npx tsx scripts/check-content-i18n.ts en guide   → une langue, un préfixe de chemin
 *
 * Pour chaque fichier traduit : l'original français existe, le schéma zod passe (limites de
 * longueur comprises), la structure est identique (mêmes clés, mêmes longueurs de tableaux) et
 * les champs invariants (slugs, URL, téléphones, catégories, identifiants…) sont inchangés.
 * Règles de traduction : docs/I18N-CONTENU.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ficheSchema, parcoursSchema, partenaireSchema, territoireSchema } from '../lib/guide/types'
import { documentTemplateSchema } from '../lib/modeles/template'
import { blogPostSchema } from '../lib/blog/types'
import { faqSchema, tutorielSchema } from '../lib/aide/types'
import { parseFrontmatter } from '../lib/blog/frontmatter'
import { INVARIANT_KEYS } from '../lib/contenus/i18n-invariants'

const ROOT = path.join(process.cwd(), 'content')
const LOCALES = ['en', 'pt'] as const
const [onlyLocale, onlyPrefix] = process.argv.slice(2)

type Problem = { file: string; msg: string }
const problems: Problem[] = []
const warnings: Problem[] = []
let checked = 0

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, '/')

/** Compare la structure FR ⇄ traduction : mêmes clés, mêmes longueurs, invariants égaux. */
function compare(fr: unknown, tr: unknown, file: string, at = ''): void {
  if (Array.isArray(fr)) {
    if (!Array.isArray(tr)) return void problems.push({ file, msg: `${at || '(racine)'} : tableau attendu` })
    if (fr.length !== tr.length) problems.push({ file, msg: `${at} : ${tr.length} éléments au lieu de ${fr.length}` })
    fr.forEach((v, i) => compare(v, tr[i], file, `${at}[${i}]`))
    return
  }
  if (fr && typeof fr === 'object') {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return void problems.push({ file, msg: `${at || '(racine)'} : objet attendu` })
    const a = Object.keys(fr).sort().join(',')
    const b = Object.keys(tr).sort().join(',')
    if (a !== b) problems.push({ file, msg: `${at || '(racine)'} : clés différentes (FR: ${a} | trad: ${b})` })
    for (const [k, v] of Object.entries(fr)) {
      const p = at ? `${at}.${k}` : k
      if (INVARIANT_KEYS.has(k)) {
        if (JSON.stringify(v) !== JSON.stringify((tr as Record<string, unknown>)[k])) problems.push({ file, msg: `${p} : champ invariant modifié (doit rester ${JSON.stringify(v)})` })
      } else {
        compare(v, (tr as Record<string, unknown>)[k], file, p)
      }
    }
    return
  }
  if (typeof fr === 'string') {
    if (!fr.trim()) return // champ vide en français (ex. aide facultative) : rien à traduire
    if (typeof tr !== 'string' || !tr.trim()) problems.push({ file, msg: `${at} : texte manquant` })
    else if (fr.length > 25 && fr === tr && /[éèàçêù]/i.test(fr)) warnings.push({ file, msg: `${at} : identique au français (non traduit ?)` })
    return
  }
  if (JSON.stringify(fr) !== JSON.stringify(tr)) problems.push({ file, msg: `${at} : valeur modifiée (${JSON.stringify(fr)} → ${JSON.stringify(tr)})` })
}

function zodCheck(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, value: unknown, file: string) {
  const r = schema.safeParse(value)
  if (!r.success) for (const i of r.error!.issues) problems.push({ file, msg: `schéma : ${i.path.join('.') || '(racine)'} : ${i.message}` })
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

function checkFile(locale: string, file: string) {
  const sub = path.relative(path.join(ROOT, 'i18n', locale), file).replace(/\\/g, '/')
  if (onlyPrefix && !sub.startsWith(onlyPrefix)) return
  const name = rel(file)
  checked++
  const raw = fs.readFileSync(file, 'utf8')

  // Modèles de documents : référence = lib/modeles/seeds.ts (pas de fichier FR dans content/).
  if (sub.startsWith('modeles/')) {
    return checkModele(sub, raw, name)
  }
  if (sub === 'conseils.json') return checkConseils(raw, name)

  const frFile = path.join(ROOT, sub)
  if (!fs.existsSync(frFile)) return void problems.push({ file: name, msg: `aucun original français (${rel(frFile)})` })
  const frRaw = fs.readFileSync(frFile, 'utf8')

  if (file.endsWith('.json')) {
    let tr: unknown
    try { tr = JSON.parse(raw) } catch (e) { return void problems.push({ file: name, msg: `JSON invalide : ${(e as Error).message}` }) }
    const fr: unknown = JSON.parse(frRaw)
    compare(fr, tr, name)
    if (sub.includes('/fiches/')) zodCheck(ficheSchema, tr, name)
    else if (sub.includes('/parcours/')) zodCheck(parcoursSchema, tr, name)
    else if (sub.endsWith('territoire.json')) zodCheck(territoireSchema, tr, name)
    else if (sub.endsWith('partenaires.demo.json')) (tr as unknown[]).forEach((p) => zodCheck(partenaireSchema, p, name))
    return
  }

  if (file.endsWith('.md')) {
    const a = parseFrontmatter(frRaw)
    const b = parseFrontmatter(raw)
    const ka = Object.keys(a.meta).sort().join(',')
    const kb = Object.keys(b.meta).sort().join(',')
    if (ka !== kb) problems.push({ file: name, msg: `frontmatter : clés différentes (FR: ${ka} | trad: ${kb})` })
    for (const k of Object.keys(a.meta)) {
      if (INVARIANT_KEYS.has(k) && a.meta[k] !== b.meta[k]) problems.push({ file: name, msg: `frontmatter ${k} : invariant modifié (doit rester « ${a.meta[k]} »)` })
      else if (!b.meta[k]?.trim()) problems.push({ file: name, msg: `frontmatter ${k} : vide` })
    }
    if (!b.body.trim()) problems.push({ file: name, msg: 'corps vide' })
    const slug = path.basename(file, '.md')
    if (sub.startsWith('faq/')) zodCheck(faqSchema, { slug, question: b.meta.title ?? 'x', categorie: 'prise-en-main', reponse: b.body, ordre: 10 }, name)
    if (sub.startsWith('tutoriels/')) zodCheck(tutorielSchema, { slug, titre: b.meta.title ?? 'x', resume: '', dureeMin: 5, icone: 'rocket', contenu: b.body, ordre: 10 }, name)
    if (sub.startsWith('blog/')) {
      zodCheck(blogPostSchema, {
        slug, titre: b.meta.titre, extrait: b.meta.extrait, contenu: b.body, couverture: b.meta.couverture ?? '', couvertureAlt: b.meta.couvertureAlt ?? '',
        categorie: b.meta.categorie, tags: (b.meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean), auteur: b.meta.auteur,
        seoTitre: b.meta.seoTitre ?? '', seoDescription: b.meta.seoDescription ?? '',
      }, name)
    }
    return
  }
  warnings.push({ file: name, msg: 'type de fichier non contrôlé' })
}

function checkModele(sub: string, raw: string, name: string) {
  // Import paresseux : seeds.ts est volumineux.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SEED_TEMPLATES } = require('../lib/modeles/seeds') as { SEED_TEMPLATES: { slug: string }[] }
  const slug = path.basename(sub, '.json')
  const fr = SEED_TEMPLATES.find((t) => t.slug === slug)
  if (!fr) return void problems.push({ file: name, msg: `modèle « ${slug} » absent de lib/modeles/seeds.ts` })
  let tr: unknown
  try { tr = JSON.parse(raw) } catch (e) { return void problems.push({ file: name, msg: `JSON invalide : ${(e as Error).message}` }) }
  const frParsed = documentTemplateSchema.parse(fr)
  compare(frParsed, tr, name)
  zodCheck(documentTemplateSchema, tr, name)
}

function checkConseils(raw: string, name: string) {
  let tr: Record<string, { titre?: string; texte?: string }>
  try { tr = JSON.parse(raw) } catch (e) { return void problems.push({ file: name, msg: `JSON invalide : ${(e as Error).message}` }) }
  for (const [slug, v] of Object.entries(tr)) {
    if (!v?.titre?.trim() || !v?.texte?.trim()) problems.push({ file: name, msg: `${slug} : titre et texte requis` })
  }
}

for (const locale of LOCALES) {
  if (onlyLocale && onlyLocale !== locale) continue
  for (const f of walk(path.join(ROOT, 'i18n', locale))) checkFile(locale, f)
}

for (const w of warnings) console.log(`AVERTISSEMENT ${w.file} : ${w.msg}`)
for (const p of problems) console.log(`ERREUR ${p.file} : ${p.msg}`)
console.log(`\n${checked} fichier(s) contrôlé(s), ${problems.length} erreur(s), ${warnings.length} avertissement(s).`)
process.exit(problems.length ? 1 : 0)
