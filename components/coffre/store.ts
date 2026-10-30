'use client'

/**
 * État partagé des écrans du coffre-fort.
 *
 * - Supabase configuré : façade sur lib/data/vault et lib/data/testimonies (RLS user_id).
 * - Démo : mini « store » sessionStorage historique, pour que les créations faites dans
 *   l'interface (catégorie, demande, confirmation…) restent visibles d'un écran à l'autre.
 *   Lecture uniquement après montage pour éviter tout écart d'hydratation.
 *
 * `LIVE` est une constante de build : la branche choisie ne change jamais entre deux rendus,
 * l'ordre des hooks reste donc stable.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  RECEIVED_TESTIMONIES, TESTIMONY_REQUESTS, VAULT_CATEGORIES, VAULT_DOCS,
  type TestimonyRequest, type VaultCategory,
} from '@/lib/mock-vault'
import { LIVE, toDataError, useAsyncData, type DataError } from '@/lib/data/core'
import {
  createCategory, demoExtraDocs, getDocument, listCategories, listDocuments, removeCategory, trashDocument,
  type VaultDocumentRecord,
} from '@/lib/data/vault'
import {
  listMyTestimonyReports, listReceivedTestimonies, listTestimonyRequests, reportTestimony, revokeTestimonyRequest, reviewTestimony,
  type ReceivedTestimonyRecord, type ReportReason, type ReportStatus,
} from '@/lib/data/testimonies'
import { listFolderDocuments } from '@/lib/data/vault'
import { withDemoCounts } from '@/lib/vault/counts'
import {
  DEFAULT_VAULT_SETTINGS, FOLDER_DEMO_DOCS, demoDocsWithFolders, getVaultSettings, listFolders, listMyFolderShares,
  listSharedWithMe, saveVaultSettings,
  type FolderShare, type SharedWithMe, type VaultFolder, type VaultSettings,
} from '@/lib/data/vault-folders'

const KEYS = {
  categories: 'lp.coffre.categories',
  hiddenCategories: 'lp.coffre.categories.deleted',
  requests: 'lp.coffre.requests',
  /** Démo : demandes clôturées par le parent. */
  closedRequests: 'lp.coffre.requests.closed',
  handledTestimonies: 'lp.coffre.testimonies.handled',
  reportedTestimonies: 'lp.coffre.testimonies.reported',
  deletedDocs: 'lp.coffre.docs.deleted',
  /** Démo : date de mise à la corbeille par document (affichée dans la corbeille). */
  deletedAt: 'lp.coffre.docs.deletedAt',
  /** Démo : documents supprimés définitivement depuis la corbeille. */
  purgedDocs: 'lp.coffre.docs.purged',
} as const

/** Démo : une écriture prévient les autres écrans montés (liste, compteurs, corbeille). */
const SYNC_EVENT = 'lp-coffre-store'

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / navigation privée : on ignore, l'état reste en mémoire */
  }
  // Hors du rendu en cours (write est appelé depuis un updater de setState).
  setTimeout(() => window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key })), 0)
}

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (LIVE) return
    setValue(read(key, fallback))
    setReady(true)
    const onSync = (e: Event) => { if ((e as CustomEvent<string>).detail === key) setValue(read(key, fallback)) }
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      write(key, v)
      return v
    })
  }, [key])
  return [value, update, ready] as const
}

const noLoad = <T,>(v: T) => () => Promise.resolve(v)

/* ---- Catégories ------------------------------------------------------- */

export function useCategories() {
  const [extra, setExtra, storedReady] = useStored<VaultCategory[]>(KEYS.categories, [])
  const [deleted, setDeleted] = useStored<string[]>(KEYS.hiddenCategories, [])
  const live = useAsyncData<VaultCategory[]>(LIVE ? listCategories : noLoad([]), `vault:categories:${LIVE}`)
  // Démo : compteurs calculés sur la MÊME liste que « Tous les documents » (et non des nombres figés).
  const { docs: demoDocs } = useDemoActiveDocs()

  const categories = LIVE
    ? (live.data ?? [])
    : withDemoCounts([...VAULT_CATEGORIES, ...extra].filter((c) => !deleted.includes(c.id)), demoDocs)

  const add = async (c: VaultCategory): Promise<VaultCategory> => {
    if (!LIVE) {
      setExtra((xs) => [...xs, c])
      return c
    }
    const created = await createCategory(c)
    live.setData((xs) => [...(xs ?? []), created])
    return created
  }
  const remove = async (id: string): Promise<void> => {
    if (!LIVE) {
      setDeleted((xs) => [...xs, id])
      return
    }
    await removeCategory(id)
    await live.refresh()
  }
  return {
    categories,
    add,
    remove,
    ready: LIVE ? !live.loading : storedReady,
    error: live.error as DataError | null,
    refresh: live.refresh,
  }
}

/* ---- Documents --------------------------------------------------------- */

/** Démo : documents partagés par l'autre parent + pièces de la messagerie (lus après montage). */
function useDemoExtraDocs() {
  const [extra, setExtra] = useState<VaultDocumentRecord[]>([])
  const [ready, setReady] = useState(LIVE)
  useEffect(() => {
    if (LIVE) return
    let alive = true
    demoExtraDocs().then((xs) => { if (alive) { setExtra(xs); setReady(true) } }, () => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])
  return { extra, ready }
}

/**
 * Démo : documents actifs = VAULT_DOCS + documents complémentaires (ajoutés, partagés, messagerie),
 * moins ceux mis à la corbeille dans la session. Source unique de la liste ET des compteurs.
 */
function useDemoActiveDocs() {
  const { deleted, ready: storedReady } = useDeletedDocs()
  const { extra, ready: extraReady } = useDemoExtraDocs()
  // Démo : dossiers lus en sessionStorage, donc seulement après montage (pas d'écart d'hydratation).
  // FOLDER_DEMO_DOCS : seuls les miens (ceux partagés par Thomas restent dans « Partagés avec moi »).
  const demoDocs = [...extra, ...FOLDER_DEMO_DOCS.filter((d) => !d.sharedBy), ...VAULT_DOCS].filter((d) => !deleted.includes(d.id))
  const docs = extraReady ? demoDocsWithFolders(demoDocs) : demoDocs
  return { docs, ready: storedReady }
}

/** Documents actifs (démo : useDemoActiveDocs ; Supabase : documents non supprimés, RLS). */
export function useVaultDocs() {
  const demo = useDemoActiveDocs()
  const live = useAsyncData<VaultDocumentRecord[]>(LIVE ? () => listDocuments() : noLoad([]), `vault:docs:${LIVE}`)
  const docs: VaultDocumentRecord[] = LIVE ? (live.data ?? []) : demo.docs
  return { docs, ready: LIVE ? !live.loading : demo.ready, loading: LIVE && live.loading, error: live.error, refresh: live.refresh }
}

/** Un document (démo : VAULT_DOCS + documents complémentaires). */
export function useVaultDoc(id: string) {
  const { extra, ready: extraReady } = useDemoExtraDocs()
  const live = useAsyncData<VaultDocumentRecord | null>(
    LIVE ? () => getDocument(id) : noLoad(null),
    `vault:doc:${id}:${LIVE}`,
  )
  const demoDoc = LIVE ? null : ([...VAULT_DOCS, ...FOLDER_DEMO_DOCS, ...extra].find((d) => d.id === id) ?? null)
  const doc = LIVE ? live.data : (demoDoc && extraReady ? demoDocsWithFolders([demoDoc])[0] : demoDoc)
  // Démo : documents complémentaires (partagé par l'autre parent, pièces de messagerie) chargés
  // après montage ; tant qu'ils ne le sont pas, « chargement » plutôt que « introuvable ».
  const loading = LIVE ? live.loading : !doc && !extraReady
  return { doc, loading, error: live.error, refresh: live.refresh, setDoc: live.setData }
}

/** Corbeille (Supabase uniquement). */
export function useTrashedDocs() {
  return useAsyncData<VaultDocumentRecord[]>(LIVE ? () => listDocuments({ trash: true }) : noLoad([]), `vault:trash:${LIVE}`)
}

/* ---- Dossiers (0410) ---------------------------------------------------- */

/**
 * Dossiers visibles (les miens + ceux partagés avec moi) et partages actifs de mes dossiers.
 * Démo : lecture après montage (sessionStorage), `version` force le rechargement après écriture.
 */
export function useFolders() {
  const [version, setVersion] = useState(0)
  const folders = useAsyncData<VaultFolder[]>(listFolders, `vault:folders:${LIVE}:${version}`)
  const shares = useAsyncData<FolderShare[]>(listMyFolderShares, `vault:folder-shares:${LIVE}:${version}`)
  const shared = useAsyncData<SharedWithMe[]>(listSharedWithMe, `vault:shared-with-me:${LIVE}:${version}`)
  const refresh = useCallback(async () => {
    if (LIVE) await Promise.all([folders.refresh(), shares.refresh(), shared.refresh()])
    else setVersion((v) => v + 1)
  }, [folders, shares, shared])
  return {
    folders: folders.data ?? [],
    shares: shares.data ?? [],
    sharedWithMe: shared.data ?? [],
    loading: folders.loading,
    /** Premier chargement seulement (un rechargement garde l'écran et ses feuilles ouvertes). */
    initialLoading: folders.loading && folders.data === null,
    error: (folders.error ?? shares.error ?? shared.error) as DataError | null,
    refresh,
  }
}

/**
 * Documents d'un dossier (le mien ou partagé avec moi). Démo : recalculés à chaque rendu
 * après montage (sessionStorage), donc à jour dès que l'écran se redessine.
 */
export function useFolderDocs(folderId: string) {
  const { deleted } = useDeletedDocs()
  const { extra, ready } = useDemoExtraDocs()
  const live = useAsyncData<VaultDocumentRecord[]>(
    LIVE ? () => listFolderDocuments(folderId) : noLoad([]),
    `vault:folder-docs:${folderId}:${LIVE}`,
  )
  const docs = LIVE
    ? (live.data ?? [])
    : ready
      ? demoDocsWithFolders([...extra, ...VAULT_DOCS, ...FOLDER_DEMO_DOCS]).filter((d) => !deleted.includes(d.id) && d.folderId === folderId)
      : []
  return { docs, loading: LIVE ? live.loading : !ready, error: live.error, refresh: live.refresh }
}

/** Réglages du coffre (rangement automatique des pièces jointes). */
export function useVaultSettings() {
  const live = useAsyncData<VaultSettings>(getVaultSettings, `vault:settings:${LIVE}`)
  const save = async (next: VaultSettings): Promise<VaultSettings> => {
    const saved = await saveVaultSettings(next)
    live.setData(saved)
    return saved
  }
  return { settings: live.data ?? DEFAULT_VAULT_SETTINGS, loading: live.loading, error: live.error, save }
}

/* ---- Demandes de témoignage ------------------------------------------ */

/** Demande clôturée : plus de témoin attendu, statut « terminée ». */
function asClosed(r: TestimonyRequest, at: string): TestimonyRequest {
  return { ...r, status: 'termine', tone: 'green', icon: 'check', finishedAt: r.finishedAt ?? at, witnesses: r.witnesses.filter((w) => w.status === 'recu') }
}

export function useRequests() {
  const [created, setCreated, storedReady] = useStored<TestimonyRequest[]>(KEYS.requests, [])
  const [closed, setClosed] = useStored<Record<string, string>>(KEYS.closedRequests, {})
  const live = useAsyncData<TestimonyRequest[]>(LIVE ? listTestimonyRequests : noLoad([]), `vault:requests:${LIVE}`)
  const requests = LIVE
    ? (live.data ?? [])
    : [...created, ...TESTIMONY_REQUESTS].map((r) => (closed[r.id] ? asClosed(r, closed[r.id]!) : r))
  const add = (r: TestimonyRequest) => {
    if (LIVE) live.setData((xs) => [r, ...(xs ?? [])])
    else setCreated((xs) => [r, ...xs])
  }
  /** Clôture la demande : le lien n'accepte plus de nouveau témoin (revoked_at), les témoignages reçus restent. */
  const close = async (id: string) => {
    const at = new Date().toISOString().slice(0, 10)
    if (!LIVE) return setClosed((m) => ({ ...m, [id]: at }))
    await revokeTestimonyRequest(id)
    live.setData((xs) => (xs ?? []).map((r) => (r.id === id ? asClosed(r, at) : r)))
  }
  return { requests, add, close, ready: LIVE ? !live.loading : storedReady, error: live.error, refresh: live.refresh }
}

/* ---- Témoignages reçus ------------------------------------------------- */

export function useReceivedTestimonies() {
  const live = useAsyncData<ReceivedTestimonyRecord[]>(LIVE ? listReceivedTestimonies : noLoad([]), `vault:received:${LIVE}`)
  return {
    testimonies: (LIVE ? (live.data ?? []) : RECEIVED_TESTIMONIES) as ReceivedTestimonyRecord[],
    ready: LIVE ? !live.loading : true,
    error: live.error,
    refresh: live.refresh,
  }
}

/* ---- Témoignages reçus traités (confirmés / refusés) ------------------ */

export type Handled = Record<string, 'confirme' | 'refuse'>

export function useHandledTestimonies() {
  const [handled, setHandled, storedReady] = useStored<Handled>(KEYS.handledTestimonies, {})
  const live = useAsyncData<ReceivedTestimonyRecord[]>(LIVE ? listReceivedTestimonies : noLoad([]), `vault:handled:${LIVE}`)
  const liveHandled: Handled = Object.fromEntries(
    (live.data ?? []).filter((t) => t.decision).map((t) => [t.id, t.decision!]),
  )
  const mark = async (id: string, v: 'confirme' | 'refuse'): Promise<void> => {
    if (!LIVE) {
      setHandled((h) => ({ ...h, [id]: v }))
      return
    }
    await reviewTestimony(id, v)
    live.setData((xs) => (xs ?? []).map((t) => (t.id === id ? { ...t, decision: v } : t)))
  }
  return { handled: LIVE ? liveHandled : handled, mark, ready: LIVE ? !live.loading : storedReady }
}

/* ---- Signalements de témoignages (0570) -------------------------------- */

export function useTestimonyReports() {
  const [demo, setDemo, storedReady] = useStored<Record<string, ReportStatus>>(KEYS.reportedTestimonies, {})
  const live = useAsyncData<Record<string, ReportStatus>>(LIVE ? listMyTestimonyReports : noLoad({}), `vault:reports:${LIVE}`)
  const report = async (id: string, reason: ReportReason, details?: string): Promise<void> => {
    if (!LIVE) {
      setDemo((r) => ({ ...r, [id]: 'open' }))
      return
    }
    await reportTestimony(id, reason, details)
    live.setData((r) => ({ ...(r ?? {}), [id]: 'open' }))
  }
  return { reports: LIVE ? (live.data ?? {}) : demo, report, ready: LIVE ? !live.loading : storedReady }
}

/* ---- Documents supprimés ---------------------------------------------- */

/**
 * Mise à la corbeille (30 jours, restaurable) — le comportement réel côté Supabase
 * (rpc soft_delete_document, migration 0101). La démo reproduit la même chose pour la session :
 * le document quitte la liste, apparaît dans la corbeille et revient s'il est restauré.
 */
export function useDeletedDocs() {
  const [deleted, setDeleted, ready] = useStored<string[]>(KEYS.deletedDocs, [])
  const [deletedAt, setDeletedAt] = useStored<Record<string, string>>(KEYS.deletedAt, {})
  const [purged, setPurged] = useStored<string[]>(KEYS.purgedDocs, [])
  const remove = async (id: string): Promise<void> => {
    if (LIVE) {
      try {
        await trashDocument(id)
      } catch (e) {
        throw toDataError(e, 'vault.trash')
      }
      return
    }
    setDeleted((xs) => (xs.includes(id) ? xs : [...xs, id]))
    setDeletedAt((m) => ({ ...m, [id]: new Date().toISOString() }))
  }
  /** Démo : restauration depuis la corbeille (Supabase : restoreDocument, lib/data/vault). */
  const restore = (id: string) => {
    setDeleted((xs) => xs.filter((x) => x !== id))
    setDeletedAt((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)))
  }
  /** Démo : suppression définitive depuis la corbeille (le document reste hors de la liste). */
  const purge = (id: string) => setPurged((xs) => (xs.includes(id) ? xs : [...xs, id]))
  return {
    deleted: LIVE ? [] : deleted,
    deletedAt: LIVE ? {} : deletedAt,
    purged: LIVE ? [] : purged,
    remove, restore, purge,
    ready: LIVE ? true : ready,
  }
}

/** Démo : documents mis à la corbeille pendant la session (les plus récents d'abord). */
export function useDemoTrash(): VaultDocumentRecord[] {
  const { deleted, deletedAt, purged } = useDeletedDocs()
  const { extra } = useDemoExtraDocs()
  if (LIVE) return []
  const all = [...extra, ...FOLDER_DEMO_DOCS, ...VAULT_DOCS]
  return deleted
    .filter((id) => !purged.includes(id))
    .flatMap((id) => {
      const d = all.find((x) => x.id === id)
      return d ? [{ ...d, deletedAt: deletedAt[id] ?? new Date().toISOString() }] : []
    })
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

/** Jeton de lien non devinable (base62, 6 caractères — format des maquettes, démo uniquement). */
export function randomToken(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
