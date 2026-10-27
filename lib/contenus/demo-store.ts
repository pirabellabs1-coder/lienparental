import 'server-only'
/**
 * Stockage du mode démonstration : en mémoire du serveur Next.
 *
 * - Partagé entre routes API, pages admin et pages publiques via `globalThis`
 *   (en développement, chaque route a son propre graphe de modules : une variable
 *   de module ne serait pas partagée).
 * - Semé au premier accès avec les fichiers du dépôt (content/guide, content/blog,
 *   lib/modeles/seeds) : ce qui est affiché au parent est donc le même contenu.
 * - Perdu au redémarrage du serveur (assumé : recette uniquement, jamais en production).
 * - Traductions : un contenu semé depuis le dépôt et jamais modifié (`fileBacked`) lit ses traductions
 *   EN/PT directement dans content/i18n/<locale>/… (les traducteurs peuvent les ajouter à chaud) ;
 *   à la première écriture, elles sont recopiées dans l'enregistrement (`translations`).
 */
import { createHash, randomUUID } from 'node:crypto'
import { getFiches, getParcoursList, getPartenairesDemo, listTerritoires } from '@/lib/guide/load'
import type { Territoire } from '@/lib/guide/types'
import { SEED_TEMPLATES } from '@/lib/modeles/seeds'
import { readSeedPosts } from '@/lib/blog/seed'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from '@/lib/aide/seed'
import type { TranslationLocale, Translations } from './i18n'
import { fileTranslations, rawFileTranslation } from './i18n-files'
import { describe, type ContentData, type ContentKind, type ContentRecord, type ContentStatus, type ContentVersion } from './types'

type Store = {
  records: Record<ContentKind, Map<string, ContentRecord>>
  versions: Map<string, ContentVersion[]>
  territoires: Map<string, Territoire>
  /** Identifiants des contenus encore identiques aux fichiers du dépôt (traductions lues dans content/i18n). */
  fileBacked: Set<string>
}

const KEY = '__lienParentalContenusDemo_v4'
type G = typeof globalThis & { [KEY]?: Store }

const MAX_VERSIONS = 50

/**
 * Identifiant stable d'un contenu de démonstration (même valeur d'un processus à l'autre) : en développement,
 * chaque route peut être servie par un processus distinct qui amorce sa propre copie de la démo ; des UUID
 * aléatoires feraient pointer les liens d'une liste vers des fiches « introuvables ».
 */
function stableId(kind: string, key: string): string {
  const h = createHash('sha1').update(`lp-demo:${kind}:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function seed(): Store {
  const store: Store = {
    records: {
      fiche: new Map(), parcours: new Map(), partenaire: new Map(), modele: new Map(), article: new Map(),
      faq: new Map(), tutoriel: new Map(), conseil: new Map(),
    },
    versions: new Map(),
    territoires: new Map(),
    fileBacked: new Set(),
  }
  const add = <K extends ContentKind>(kind: K, data: ContentData[K], opts: { statut?: ContentStatus; at?: string; publishedAt?: string | null; id?: string } = {}) => {
    // Jamais de date future à l'amorçage (une fiche vérifiée « aujourd'hui » ne doit pas paraître programmée).
    const nowIso = new Date().toISOString()
    const at = opts.at && opts.at < nowIso ? opts.at : nowIso
    const statut = opts.statut ?? 'publie'
    const d0 = describe(kind, data)
    const rec = makeRecord(kind, opts.id ?? stableId(kind, `${d0.territoire ?? ''}:${d0.slug || d0.titre}`), data, {
      statut,
      version: 1,
      createdAt: at,
      updatedAt: at,
      publishedAt: statut === 'publie' ? (opts.publishedAt && opts.publishedAt < nowIso ? opts.publishedAt : at) : null,
    })
    store.records[kind].set(rec.id, rec as ContentRecord)
    store.fileBacked.add(rec.id)
    logVersion(store, rec as ContentRecord, 'creation', 'Import initial')
    // Traductions lues dans les fichiers (non figées à l'amorçage) : l'instantané initial n'en porte pas,
    // et restaurer cette version conserve donc les traductions courantes (comme un instantané d'avant 0490).
    delete (store.versions.get(rec.id)?.[0]?.snapshot as Partial<ContentRecord> | undefined)?.translations
  }

  for (const t of listTerritoires()) {
    store.territoires.set(t.code, t)
    for (const f of getFiches(t.code)) add('fiche', f, { at: `${f.derniereVerification}T08:00:00.000Z` })
    for (const p of getParcoursList(t.code)) add('parcours', p)
    for (const p of getPartenairesDemo(t.code)) {
      const id = stableId('partenaire', `${t.code}:${describe('partenaire', p as ContentData['partenaire']).titre}`)
      add('partenaire', { ...p, id }, { id })
    }
  }
  for (const t of SEED_TEMPLATES) add('modele', t)
  for (const s of readSeedPosts()) add('article', s.post, { statut: s.statut, at: s.publishedAt, publishedAt: s.publishedAt })
  for (const f of readSeedFaq()) add('faq', f)
  for (const t of readSeedTutoriels()) add('tutoriel', t)
  for (const c of readSeedConseils()) add('conseil', c)
  return store
}

export function demoStore(): Store {
  const g = globalThis as G
  if (!g[KEY]) g[KEY] = seed()
  return g[KEY]
}

export function makeRecord<K extends ContentKind>(
  kind: K,
  id: string,
  data: ContentData[K],
  env: Pick<ContentRecord, 'statut' | 'version' | 'createdAt' | 'updatedAt' | 'publishedAt'>,
  translations: Translations = {},
): ContentRecord<K> {
  const d = describe(kind, data)
  return { id, kind, ...env, titre: d.titre, slug: d.slug, territoire: d.territoire, data, translations }
}

/** Traduction brute d'un contenu de démonstration pour une langue (enregistrement, sinon fichier du dépôt). */
export function demoTranslation(store: Store, rec: ContentRecord, locale: TranslationLocale): unknown {
  if (rec.translations[locale] !== undefined) return rec.translations[locale]
  return store.fileBacked.has(rec.id) ? rawFileTranslation(rec.kind, rec.data, locale) ?? undefined : undefined
}

/** Toutes les traductions d'un contenu de démonstration (fichiers du dépôt valides + saisies admin). */
export function demoTranslations(store: Store, rec: ContentRecord): Translations {
  if (!store.fileBacked.has(rec.id)) return rec.translations
  return { ...fileTranslations(rec.kind, rec.data), ...rec.translations }
}

/** Vue « admin » d'un enregistrement de démonstration (traductions des fichiers incluses). */
export function demoView<K extends ContentKind>(store: Store, rec: ContentRecord<K>): ContentRecord<K> {
  return store.fileBacked.has(rec.id) ? { ...rec, translations: demoTranslations(store, rec as ContentRecord) } : rec
}

/** Avant une écriture : fige les traductions lues dans les fichiers, puis l'enregistrement vit sa vie. */
export function detachFromFiles(store: Store, rec: ContentRecord): Translations {
  const t = demoTranslations(store, rec)
  store.fileBacked.delete(rec.id)
  return t
}

export function logVersion(store: Store, rec: ContentRecord, action: ContentVersion['action'], actor: string | null) {
  const list = store.versions.get(rec.id) ?? []
  list.unshift({
    id: randomUUID(),
    version: rec.version,
    action,
    statut: rec.statut,
    titre: rec.titre,
    actor,
    createdAt: new Date().toISOString(),
    snapshot: structuredClone(rec),
  })
  store.versions.set(rec.id, list.slice(0, MAX_VERSIONS))
}
