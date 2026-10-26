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
  listReceivedTestimonies, listTestimonyRequests, reviewTestimony, type ReceivedTestimonyRecord,
} from '@/lib/data/testimonies'
import { listFolderDocuments } from '@/lib/data/vault'
import {
  DEFAULT_VAULT_SETTINGS, FOLDER_DEMO_DOCS, demoDocsWithFolders, getVaultSettings, listFolders, listMyFolderShares,
  listSharedWithMe, saveVaultSettings,
  type FolderShare, type SharedWithMe, type VaultFolder, type VaultSettings,
} from '@/lib/data/vault-folders'

const KEYS = {
  categories: 'lp.coffre.categories',
  hiddenCategories: 'lp.coffre.categories.deleted',
  requests: 'lp.coffre.requests',
  handledTestimonies: 'lp.coffre.testimonies.handled',
  deletedDocs: 'lp.coffre.docs.deleted',
} as const

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
}

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (LIVE) return
    setValue(read(key, fallback))
    setReady(true)
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

  const categories = LIVE
    ? (live.data ?? [])
    : [...VAULT_CATEGORIES, ...extra].filter((c) => !deleted.includes(c.id))

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

/** Documents actifs (démo : VAULT_DOCS + documents complémentaires, moins ceux supprimés dans la session). */
export function useVaultDocs() {
  const { deleted, ready: storedReady } = useDeletedDocs()
  const { extra, ready: extraReady } = useDemoExtraDocs()
  const live = useAsyncData<VaultDocumentRecord[]>(LIVE ? () => listDocuments() : noLoad([]), `vault:docs:${LIVE}`)
  // Démo : dossiers lus en sessionStorage, donc seulement après montage (pas d'écart d'hydratation).
  // FOLDER_DEMO_DOCS : seuls les miens (ceux partagés par Thomas restent dans « Partagés avec moi »).
  const demoDocs = [...extra, ...FOLDER_DEMO_DOCS.filter((d) => !d.sharedBy), ...VAULT_DOCS].filter((d) => !deleted.includes(d.id))
  const docs: VaultDocumentRecord[] = LIVE ? (live.data ?? []) : extraReady ? demoDocsWithFolders(demoDocs) : demoDocs
  return { docs, ready: LIVE ? !live.loading : storedReady, loading: LIVE && live.loading, error: live.error, refresh: live.refresh }
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

export function useRequests() {
  const [created, setCreated, storedReady] = useStored<TestimonyRequest[]>(KEYS.requests, [])
  const live = useAsyncData<TestimonyRequest[]>(LIVE ? listTestimonyRequests : noLoad([]), `vault:requests:${LIVE}`)
  const requests = LIVE ? (live.data ?? []) : [...created, ...TESTIMONY_REQUESTS]
  const add = (r: TestimonyRequest) => {
    if (LIVE) live.setData((xs) => [r, ...(xs ?? [])])
    else setCreated((xs) => [r, ...xs])
  }
  return { requests, add, ready: LIVE ? !live.loading : storedReady, error: live.error, refresh: live.refresh }
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

/* ---- Documents supprimés ---------------------------------------------- */

export function useDeletedDocs() {
  const [deleted, setDeleted, ready] = useStored<string[]>(KEYS.deletedDocs, [])
  /** Démo : masque le document pour la session. Supabase : mise à la corbeille (30 jours). */
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
  }
  return { deleted: LIVE ? [] : deleted, remove, ready: LIVE ? true : ready }
}

/** Jeton de lien non devinable (base62, 6 caractères — format des maquettes, démo uniquement). */
export function randomToken(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
