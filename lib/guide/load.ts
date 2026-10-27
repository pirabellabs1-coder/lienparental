import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import type { z } from 'zod'
import {
  DEFAULT_TERRITOIRE, ficheSchema, parcoursSchema, partenaireSchema, territoireSchema,
  type Fiche, type FicheResume, type GuideCategoryKey, type Parcours, type Partenaire, type Territoire,
} from './types'
import { toContentLocale, type ContentLocale, type Localized } from '@/lib/contenus/i18n'
import { localizeFromFiles, localizeTerritoire } from '@/lib/contenus/i18n-files'
import type { ContentKind, ContentData } from '@/lib/contenus/types'

/**
 * Chargement du Guide depuis `content/guide/<territoire>/` (lecture serveur, validation zod).
 * Une fiche invalide fait échouer le chargement avec le nom du fichier : mieux vaut une erreur
 * visible en recette qu'une information erronée affichée à un parent.
 *
 * Langue (`locale`, défaut 'fr') : les traductions de content/i18n/<locale>/guide/… sont superposées
 * fiche par fiche (lib/contenus/i18n-files.ts) ; sans traduction valide, la fiche reste en français et
 * porte `lang: 'fr'` (attribut `lang` du conteneur, accessibilité). Le français n'a jamais de `lang`.
 */
const ROOT = path.join(process.cwd(), 'content', 'guide')
const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readJsonDir<T>(dir: string, parse: (raw: unknown, file: string) => T): T[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = path.join(dir, f)
      return parse(JSON.parse(fs.readFileSync(file, 'utf8')), path.relative(ROOT, file))
    })
}

function validate<S extends z.ZodTypeAny>(schema: S, raw: unknown, file: string): z.output<S> {
  const r = schema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join(' ; ')
    throw new Error(`[guide] contenu invalide dans ${file} : ${detail}`)
  }
  return r.data
}

type TerritoryContent = {
  territoire: Territoire
  fiches: Fiche[]
  parcours: Parcours[]
  partenairesDemo: Partenaire[]
}

const loadTerritory = cache((code: string): TerritoryContent | null => {
  if (!SAFE.test(code)) return null
  const dir = path.join(ROOT, code)
  const metaFile = path.join(dir, 'territoire.json')
  if (!dir.startsWith(ROOT) || !fs.existsSync(metaFile)) return null

  const territoire = validate(territoireSchema, JSON.parse(fs.readFileSync(metaFile, 'utf8')), path.relative(ROOT, metaFile))
  if (territoire.code !== code) throw new Error(`[guide] ${code}/territoire.json : code « ${territoire.code} » différent du dossier`)

  const fiches = readJsonDir(path.join(dir, 'fiches'), (raw, file) => {
    const f = validate(ficheSchema, raw, file)
    if (f.territoire !== code) throw new Error(`[guide] ${file} : territoire « ${f.territoire} » différent du dossier`)
    if (`${f.slug}.json` !== path.basename(file)) throw new Error(`[guide] ${file} : le slug doit correspondre au nom du fichier`)
    return f
  })
  const slugs = new Set(fiches.map((f) => f.slug))

  const parcours = readJsonDir(path.join(dir, 'parcours'), (raw, file) => {
    const p = validate(parcoursSchema, raw, file)
    for (const el of p.elements) {
      if (el.fiche && !slugs.has(el.fiche)) throw new Error(`[guide] ${file} : fiche « ${el.fiche} » introuvable`)
    }
    return p
  }).sort((a, b) => a.ordre - b.ordre)

  const demoFile = path.join(dir, 'partenaires.demo.json')
  const partenairesDemo = fs.existsSync(demoFile)
    ? (JSON.parse(fs.readFileSync(demoFile, 'utf8')) as unknown[]).map((raw) => validate(partenaireSchema, raw, path.relative(ROOT, demoFile)))
    : []

  return { territoire, fiches, parcours, partenairesDemo }
})

/** Contenus du dépôt dans la langue demandée (français : tableaux d'origine, inchangés). */
function localizeList<K extends ContentKind>(kind: K, items: ContentData[K][], locale: ContentLocale): Localized<ContentData[K]>[] {
  if (locale === 'fr') return items
  return items.map((it) => {
    const r = localizeFromFiles(kind, it, locale)
    return { ...r.data, lang: r.lang }
  })
}

/** Territoires présents dans `content/guide/` (un dossier = un territoire), noms traduits si `locale`. */
export function listTerritoires(locale: ContentLocale = 'fr'): Territoire[] {
  const all = listTerritoiresFr()
  return locale === 'fr' ? all : all.map((t) => localizeTerritoire(t, locale))
}

const listTerritoiresFr = cache((): Territoire[] => {
  if (!fs.existsSync(ROOT)) return []
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SAFE.test(d.name))
    .map((d) => loadTerritory(d.name)?.territoire)
    .filter((t): t is Territoire => Boolean(t))
    .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
})

/** Territoire demandé s'il est disponible, sinon le territoire par défaut. */
export function resolveTerritoire(raw: string | string[] | undefined, locale: ContentLocale = 'fr'): Territoire {
  const wanted = Array.isArray(raw) ? raw[0] : raw
  const all = listTerritoires(locale).filter((t) => t.disponible)
  const found = all.find((t) => t.code === wanted) ?? all.find((t) => t.code === DEFAULT_TERRITOIRE) ?? all[0]
  if (!found) throw new Error('[guide] aucun territoire disponible dans content/guide')
  return found
}

export function getFiches(territoire: string, locale: ContentLocale = 'fr'): Localized<Fiche>[] {
  return localizeList('fiche', loadTerritory(territoire)?.fiches ?? [], locale)
}

export function getFiche(territoire: string, slug: string, locale: ContentLocale = 'fr'): Localized<Fiche> | undefined {
  return getFiches(territoire, locale).find((f) => f.slug === slug)
}

export function getFichesByCategory(territoire: string, cat: GuideCategoryKey, locale: ContentLocale = 'fr'): Localized<Fiche>[] {
  return getFiches(territoire, locale).filter((f) => f.categorie === cat)
}

export function getParcoursList(territoire: string, locale: ContentLocale = 'fr'): Localized<Parcours>[] {
  return localizeList('parcours', loadTerritory(territoire)?.parcours ?? [], locale)
}

export function getParcours(territoire: string, slug: string, locale: ContentLocale = 'fr'): Localized<Parcours> | undefined {
  return getParcoursList(territoire, locale).find((p) => p.slug === slug)
}

/** Parcours qui citent une fiche (pour les liens croisés). */
export function getParcoursForFiche(territoire: string, ficheSlug: string, locale: ContentLocale = 'fr'): Localized<Parcours>[] {
  return getParcoursList(territoire, locale).filter((p) => p.elements.some((e) => e.fiche === ficheSlug))
}

export function getPartenairesDemo(territoire: string, locale: ContentLocale = 'fr'): Localized<Partenaire>[] {
  const list = loadTerritory(territoire)?.partenairesDemo ?? []
  if (locale === 'fr') return list
  // Validation avec le schéma « admin » (même forme ; `demo` et `id` restent ceux du français).
  return localizeList('partenaire', list as ContentData['partenaire'][], locale)
}

export function toResume(f: Fiche): FicheResume {
  return { slug: f.slug, categorie: f.categorie, titre: f.titre, resume: f.resume, motsCles: f.motsCles }
}

// =====================================================================================
// Lecture administrable (chantier E) : base de données ou back-office de démonstration
// =====================================================================================
//
// Les fonctions synchrones ci-dessus lisent les fichiers du dépôt (semences, script
// check:guide, import). Les pages du Guide doivent utiliser `loadGuide()` ci-dessous :
// - Supabase actif : fiches et parcours PUBLIÉS des tables guide_fiches / guide_parcours
//   (0300_admin_contenus.sql), territoires de guide_territoires. Base indisponible : repli
//   sur les fichiers (le parent garde une information vérifiée plutôt qu'une page d'erreur).
// - Démonstration : contenus du back-office en mémoire (semés depuis les mêmes fichiers),
//   donc une fiche modifiée ou dépubliée dans /admin/guides l'est aussi dans /app/guide.

export type GuideSnapshot = {
  territoire: Territoire
  territoires: Territoire[]
  /** Dans la langue demandée ; `lang: 'fr'` = affiché en français faute de traduction (interface EN/PT). */
  fiches: Localized<Fiche>[]
  parcours: Localized<Parcours>[]
  /** Exemples fictifs (mode démonstration uniquement ; en production les offres viennent de guide_partners). */
  partenairesDemo: Localized<Partenaire>[]
  source: 'base' | 'demo' | 'fichiers'
}

function fileSnapshot(raw: string | string[] | undefined, locale: ContentLocale): GuideSnapshot {
  const territoire = resolveTerritoire(raw, locale)
  return {
    territoire,
    territoires: listTerritoires(locale),
    fiches: getFiches(territoire.code, locale),
    parcours: getParcoursList(territoire.code, locale),
    partenairesDemo: getPartenairesDemo(territoire.code, locale),
    source: 'fichiers',
  }
}

/** Retire des parcours les liens vers des fiches non publiées (jamais de lien mort). */
function pruneParcours<P extends Parcours>(parcours: P[], fiches: Fiche[]): P[] {
  const slugs = new Set(fiches.map((f) => f.slug))
  return parcours
    .map((p) => ({ ...p, elements: p.elements.map((e) => (e.fiche && !slugs.has(e.fiche) ? { ...e, fiche: undefined } : e)) }))
    .sort((a, b) => a.ordre - b.ordre)
}

// Clé de mémoïsation React : (territoire, langue) ; une page EN ne reçoit jamais le Guide FR d'une autre.
const loadGuideCached = cache(async (wanted: string | undefined, locale: ContentLocale): Promise<GuideSnapshot> => {
  const { listPublished, listPublicTerritoires, CONTENT_LIVE } = await import('@/lib/contenus/public')
  try {
    const all = (await listPublicTerritoires())
      .map((t) => territoireSchema.safeParse(t))
      .flatMap((r) => (r.success ? [localizeTerritoire(r.data, locale)] : []))
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
    const dispo = all.filter((t) => t.disponible)
    const territoire = dispo.find((t) => t.code === wanted) ?? dispo.find((t) => t.code === DEFAULT_TERRITOIRE) ?? dispo[0]
    if (!territoire) return fileSnapshot(wanted, locale)

    const [fiches, parcours, partenaires] = await Promise.all([
      listPublished('fiche', { territoire: territoire.code, locale }),
      listPublished('parcours', { territoire: territoire.code, locale }),
      CONTENT_LIVE ? Promise.resolve([]) : listPublished('partenaire', { territoire: territoire.code, locale }),
    ])
    const withLang = <T,>(data: T, lang: ContentLocale | undefined): Localized<T> => (locale === 'fr' || !lang ? data : { ...data, lang }) as Localized<T>
    // Même ordre que la lecture des fichiers (par slug) : affichage stable d'une source à l'autre.
    const ficheList = fiches.map((r) => withLang(r.data, r.lang)).sort((a, b) => a.slug.localeCompare(b.slug))
    // Base vide pour ce territoire (migration de contenu pas encore faite, import raté) :
    // on sert les fichiers du dépôt plutôt qu'un Guide vide, s'ils ont des fiches.
    if (ficheList.length === 0) {
      const files = fileSnapshot(territoire.code, locale)
      if (files.territoire.code === territoire.code && files.fiches.length > 0) {
        console.warn(`[guide] aucune fiche publiée en base pour « ${territoire.code} », repli sur les fichiers`)
        return files
      }
    }
    return {
      territoire,
      territoires: all,
      fiches: ficheList,
      parcours: pruneParcours(parcours.map((r) => withLang(r.data, r.lang)), ficheList),
      partenairesDemo: partenaires.map((r) => ({ ...withLang(r.data, r.lang), demo: true })),
      source: CONTENT_LIVE ? 'base' : 'demo',
    }
  } catch (e) {
    console.warn('[guide] lecture administrable impossible, repli sur les fichiers :', e instanceof Error ? e.message : e)
    return fileSnapshot(wanted, locale)
  }
})

/**
 * Contenu publié du Guide pour un territoire (paramètre `?territoire=`) et une langue, mémoïsé par requête.
 * Usage : `const g = await loadGuide(sp.territoire, await getLocale())` puis g.fiches, g.parcours, g.territoires…
 * `locale` est revalidée (fr | en | pt, sinon français).
 */
export async function loadGuide(raw?: string | string[], locale: string = 'fr'): Promise<GuideSnapshot> {
  const wanted = Array.isArray(raw) ? raw[0] : raw
  return loadGuideCached(wanted && SAFE.test(wanted) ? wanted : undefined, toContentLocale(locale))
}

/** Équivalents asynchrones des fonctions synchrones, pour une migration des pages ligne à ligne. */
export const guideAsync = {
  fiche: async (raw: string | string[] | undefined, slug: string, locale?: string) => (await loadGuide(raw, locale)).fiches.find((f) => f.slug === slug),
  ficheParDefaut: async (slug: string, locale?: string) => (await loadGuide(DEFAULT_TERRITOIRE, locale)).fiches.find((f) => f.slug === slug),
  parcours: async (raw: string | string[] | undefined, slug: string, locale?: string) => (await loadGuide(raw, locale)).parcours.find((p) => p.slug === slug),
  parcoursPourFiche: async (raw: string | string[] | undefined, ficheSlug: string, locale?: string) =>
    (await loadGuide(raw, locale)).parcours.filter((p) => p.elements.some((e) => e.fiche === ficheSlug)),
  fichesParCategorie: async (raw: string | string[] | undefined, cat: GuideCategoryKey, locale?: string) =>
    (await loadGuide(raw, locale)).fiches.filter((f) => f.categorie === cat),
}
