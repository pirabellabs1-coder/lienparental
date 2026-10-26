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
 */
import { randomUUID } from 'node:crypto'
import { getFiches, getParcoursList, getPartenairesDemo, listTerritoires } from '@/lib/guide/load'
import type { Territoire } from '@/lib/guide/types'
import { SEED_TEMPLATES } from '@/lib/modeles/seeds'
import { readSeedPosts } from '@/lib/blog/seed'
import { readSeedConseils, readSeedFaq, readSeedTutoriels } from '@/lib/aide/seed'
import { describe, type ContentData, type ContentKind, type ContentRecord, type ContentStatus, type ContentVersion } from './types'

type Store = {
  records: Record<ContentKind, Map<string, ContentRecord>>
  versions: Map<string, ContentVersion[]>
  territoires: Map<string, Territoire>
}

const KEY = '__lienParentalContenusDemo_v3'
type G = typeof globalThis & { [KEY]?: Store }

const MAX_VERSIONS = 50

function seed(): Store {
  const store: Store = {
    records: {
      fiche: new Map(), parcours: new Map(), partenaire: new Map(), modele: new Map(), article: new Map(),
      faq: new Map(), tutoriel: new Map(), conseil: new Map(),
    },
    versions: new Map(),
    territoires: new Map(),
  }
  const add = <K extends ContentKind>(kind: K, data: ContentData[K], opts: { statut?: ContentStatus; at?: string; publishedAt?: string | null; id?: string } = {}) => {
    // Jamais de date future à l'amorçage (une fiche vérifiée « aujourd'hui » ne doit pas paraître programmée).
    const nowIso = new Date().toISOString()
    const at = opts.at && opts.at < nowIso ? opts.at : nowIso
    const statut = opts.statut ?? 'publie'
    const rec = makeRecord(kind, opts.id ?? randomUUID(), data, {
      statut,
      version: 1,
      createdAt: at,
      updatedAt: at,
      publishedAt: statut === 'publie' ? (opts.publishedAt && opts.publishedAt < nowIso ? opts.publishedAt : at) : null,
    })
    store.records[kind].set(rec.id, rec as ContentRecord)
    logVersion(store, rec as ContentRecord, 'creation', 'Import initial')
  }

  for (const t of listTerritoires()) {
    store.territoires.set(t.code, t)
    for (const f of getFiches(t.code)) add('fiche', f, { at: `${f.derniereVerification}T08:00:00.000Z` })
    for (const p of getParcoursList(t.code)) add('parcours', p)
    for (const p of getPartenairesDemo(t.code)) {
      const id = randomUUID()
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
): ContentRecord<K> {
  const d = describe(kind, data)
  return { id, kind, ...env, titre: d.titre, slug: d.slug, territoire: d.territoire, data }
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
