/**
 * Traductions du contenu stockées dans le dépôt : `content/i18n/<locale>/…` (même arborescence et
 * même format que `content/`, plus `modeles/<slug>.json` et `conseils.json`). Voir docs/I18N-CONTENU.md.
 *
 * Volontairement SANS `server-only` : utilisé aussi par les scripts (scripts/seed-contenus-sql.ts).
 * Lecture disque uniquement, chemins construits à partir de slugs validés (jamais de chemin libre).
 * Une traduction absente, illisible ou invalide = français (fichier par fichier, jamais d'erreur).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from '../blog/frontmatter'
import { territoireSchema, type Territoire } from '../guide/types'
import {
  TRANSLATION_LOCALES, checkTranslation, localizeWithLang, overlayTranslation,
  type ContentLocale, type TranslationLocale, type Translations,
} from './i18n'
import type { ContentData, ContentKind } from './types'

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function i18nRoot(): string {
  return path.join(process.cwd(), 'content', 'i18n')
}

// Petit cache par date de modification : les traducteurs peuvent modifier les fichiers à chaud.
const cache = new Map<string, { mtimeMs: number; value: unknown }>()

function readFile(locale: TranslationLocale, parts: string[], parse: (raw: string) => unknown): unknown | null {
  // Locale revérifiée à l'exécution (le typage seul ne protège pas d'une valeur venue de l'extérieur).
  if (!(TRANSLATION_LOCALES as readonly string[]).includes(locale)) return null
  if (!parts.every((p) => /^[a-z0-9.-]+$/.test(p) && !p.startsWith('.'))) return null
  const root = i18nRoot()
  const file = path.join(root, locale, ...parts)
  if (!file.startsWith(path.join(root, locale) + path.sep)) return null
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(file).mtimeMs
  } catch {
    return null
  }
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === mtimeMs) return hit.value
  let value: unknown = null
  try {
    value = parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.warn(`[i18n] ${path.relative(process.cwd(), file)} illisible, français conservé : ${e instanceof Error ? e.message : e}`)
  }
  cache.set(file, { mtimeMs, value })
  return value
}

const readJson = (locale: TranslationLocale, ...parts: string[]) => readFile(locale, parts, (raw) => JSON.parse(raw))
const readMd = (locale: TranslationLocale, ...parts: string[]) =>
  readFile(locale, parts, (raw) => parseFrontmatter(raw)) as { meta: Record<string, string>; body: string } | null

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Ne garde que les clés définies (une clé absente = texte français conservé). */
function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''))
}

/**
 * Objet de traduction BRUT (avant superposition) d'un contenu du dépôt, ou null s'il n'y a pas de
 * fichier pour cette langue. L'appelant le passe à localizeData / checkTranslation.
 */
export function rawFileTranslation<K extends ContentKind>(kind: K, fr: ContentData[K], locale: TranslationLocale): unknown | null {
  const d = fr as Record<string, unknown>
  const slug = typeof d.slug === 'string' ? d.slug : ''
  switch (kind) {
    case 'fiche':
    case 'parcours': {
      const terr = String(d.territoire ?? '')
      if (!SAFE.test(slug) || !SAFE.test(terr)) return null
      return readJson(locale, 'guide', terr, kind === 'fiche' ? 'fiches' : 'parcours', `${slug}.json`)
    }
    case 'partenaire': {
      const terr = String(d.territoire ?? '')
      if (!SAFE.test(terr)) return null
      const list = readJson(locale, 'guide', terr, 'partenaires.demo.json')
      return Array.isArray(list) ? list.find((p) => obj(p)?.id === d.id) ?? null : null
    }
    case 'modele':
      return SAFE.test(slug) ? readJson(locale, 'modeles', `${slug}.json`) : null
    case 'article': {
      if (!SAFE.test(slug)) return null
      const md = readMd(locale, 'blog', `${slug}.md`)
      if (!md) return null
      const m = md.meta
      return defined({
        titre: m.titre, extrait: m.extrait, contenu: md.body, couvertureAlt: m.couvertureAlt,
        tags: m.tags ? m.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        auteur: m.auteur, seoTitre: m.seoTitre, seoDescription: m.seoDescription,
      })
    }
    case 'faq': {
      if (!SAFE.test(slug)) return null
      const md = readMd(locale, 'faq', `${slug}.md`)
      if (!md?.body) return null // pas de réponse traduite : la question seule ne suffit pas
      const index = obj(readJson(locale, 'faq', 'index.json'))
      const q = Array.isArray(index?.questions) ? index.questions.map(obj).find((x) => x?.slug === slug) : null
      return defined({ question: typeof q?.question === 'string' ? q.question : md.meta.title, reponse: md.body })
    }
    case 'tutoriel': {
      if (!SAFE.test(slug)) return null
      const md = readMd(locale, 'tutoriels', `${slug}.md`)
      if (!md?.body) return null
      const index = obj(readJson(locale, 'tutoriels', 'index.json'))
      const t = Array.isArray(index?.tutoriels) ? index.tutoriels.map(obj).find((x) => x?.slug === slug) : null
      return defined({ titre: typeof t?.title === 'string' ? t.title : md.meta.title, contenu: md.body })
    }
    case 'conseil': {
      if (!SAFE.test(slug)) return null
      const all = obj(readJson(locale, 'conseils.json'))
      const c = obj(all?.[slug])
      return c ? defined({ titre: c.titre, texte: c.texte }) : null
    }
    default:
      return null
  }
}

/** Traductions VALIDES d'un contenu du dépôt, objets complets (import en base, démonstration). */
export function fileTranslations<K extends ContentKind>(kind: K, fr: ContentData[K]): Translations {
  const out: Translations = {}
  for (const l of TRANSLATION_LOCALES) {
    const raw = rawFileTranslation(kind, fr, l)
    if (raw == null) continue
    const r = checkTranslation(kind, fr, raw)
    if (r.ok) out[l] = r.data
    else console.warn(`[i18n] traduction ${l} de ${kind} « ${String((fr as { slug?: string }).slug ?? '')} » ignorée (${r.reason})`)
  }
  return out
}

/** Contenu du dépôt dans la langue demandée (repli français fichier par fichier). */
export function localizeFromFiles<K extends ContentKind>(kind: K, fr: ContentData[K], locale: ContentLocale): { data: ContentData[K]; lang: ContentLocale } {
  if (locale === 'fr') return { data: fr, lang: 'fr' }
  const raw = rawFileTranslation(kind, fr, locale)
  return localizeWithLang(kind, fr, raw == null ? {} : { [locale]: raw }, locale)
}

/** Nom du territoire traduit (content/i18n/<l>/guide/<code>/territoire.json), code et options inchangés. */
export function localizeTerritoire(t: Territoire, locale: ContentLocale): Territoire {
  if (locale === 'fr' || !SAFE.test(t.code)) return t
  const raw = readJson(locale, 'guide', t.code, 'territoire.json')
  if (raw == null) return t
  const o = overlayTranslation(t, raw)
  if (o.mismatch) return t
  const r = territoireSchema.safeParse(o.value)
  return r.success ? r.data : t
}
