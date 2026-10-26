'use client'

/**
 * Progression du Guide (fiches et parcours).
 * - Démonstration : localStorage (protégé par try/catch, la page fonctionne sans).
 * - Supabase : table `guide_progress` (RLS user_id = auth.uid(), migration 0250).
 * Clé d'un élément : `<territoire>:<type>:<slug>:<element>` (même clé que la contrainte unique 0280).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { DataError, LIVE, db, requireUserId, toDataError } from '@/lib/data/core'
import { PROGRESS_STATUSES, type ProgressRefType, type ProgressStatus } from './types'

const STORAGE_KEY = 'lp_guide_progress_v2'
type ProgressMap = Record<string, ProgressStatus>

// Progression par territoire : la même fiche peut exister dans deux territoires.
let state: ProgressMap = {}
const listeners = new Set<() => void>()

type LoadStatus = { ready: boolean; error: string | null }
/** Un chargement par territoire (promesse partagée entre composants, rejouable après échec). */
const loads = new Map<string, Promise<void>>()
const status = new Map<string, LoadStatus>()
let statusVersion = 0

const keyOf = (territoire: string, refType: ProgressRefType, slug: string, element: string) => `${territoire}:${refType}:${slug}:${element}`
const isStatus = (v: unknown): v is ProgressStatus => typeof v === 'string' && (PROGRESS_STATUSES as readonly string[]).includes(v)

function emit() { listeners.forEach((l) => l()) }

function setStatus(territoire: string, s: LoadStatus) {
  status.set(territoire, s)
  statusVersion++
  emit()
}

// Démo : clé locale v2 (préfixée par le territoire). Les anciennes clés v1 (sans territoire)
// sont rattachées au territoire de lancement.
const LEGACY_KEY = 'lp_guide_progress_v1'
const LEGACY_TERRITOIRE = 'guyane'

function readLocal(): ProgressMap {
  const out: ProgressMap = {}
  const take = (raw: string | null, prefix: string) => {
    if (!raw) return
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (k.length <= 200 && isStatus(v)) out[prefix + k] = v
  }
  try { take(localStorage.getItem(LEGACY_KEY), `${LEGACY_TERRITOIRE}:`) } catch { /* ignoré */ }
  try { take(localStorage.getItem(STORAGE_KEY), '') } catch { /* ignoré */ }
  return out
}

function writeLocal(map: ProgressMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch { /* stockage indisponible : progression non conservée */ }
}

type Row = { ref_type: ProgressRefType; ref_slug: string; element: string; statut: ProgressStatus }

function load(territoire: string): Promise<void> {
  const pending = loads.get(territoire)
  if (pending) return pending
  const p = (async () => {
    setStatus(territoire, { ready: false, error: null })
    if (!LIVE) {
      state = { ...readLocal(), ...state }
      setStatus(territoire, { ready: true, error: null })
      return
    }
    try {
      const { data, error } = await db().from('guide_progress').select('ref_type, ref_slug, element, statut').eq('territoire', territoire)
      if (error) throw error
      const next: ProgressMap = { ...state }
      for (const r of (data ?? []) as Row[]) if (isStatus(r.statut)) next[keyOf(territoire, r.ref_type, r.ref_slug, r.element)] = r.statut
      state = next
      setStatus(territoire, { ready: true, error: null })
    } catch (e) {
      // Échec : pas d'état « vide » trompeur. On expose l'erreur et on autorise un nouvel essai.
      loads.delete(territoire)
      setStatus(territoire, { ready: false, error: toDataError(e, 'guide_progress.select', 'Votre progression n’a pas pu être chargée.').message })
    }
  })()
  loads.set(territoire, p)
  return p
}

async function persist(territoire: string, refType: ProgressRefType, slug: string, element: string, statut: ProgressStatus) {
  if (!LIVE) { writeLocal(state); return }
  try {
    const user_id = await requireUserId()
    const { error } = await db().from('guide_progress').upsert(
      { user_id, territoire, ref_type: refType, ref_slug: slug, element, statut },
      // Contrainte unique incluant le territoire (migration 0280).
      { onConflict: 'user_id,territoire,ref_type,ref_slug,element' },
    )
    if (error) throw error
  } catch (e) {
    throw toDataError(e, 'guide_progress.upsert', 'La progression n’a pas pu être enregistrée.')
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => state
// Référence stable : un nouvel objet à chaque appel ferait boucler useSyncExternalStore.
const EMPTY_PROGRESS: ProgressMap = {}
const serverSnapshot = (): ProgressMap => EMPTY_PROGRESS
const versionSnapshot = () => statusVersion
const serverVersion = () => -1
const NOT_LOADED: LoadStatus = { ready: false, error: null }

/**
 * Accès à la progression d'un territoire.
 * `ready` : progression chargée (contrôles à désactiver tant que faux) ;
 * `error` : message de chargement à afficher avec « Réessayer » (`retry`).
 */
export function useGuideProgress(territoire: string) {
  const map = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const version = useSyncExternalStore(subscribe, versionSnapshot, serverVersion)
  useEffect(() => { void load(territoire) }, [territoire])
  const st = version < 0 ? NOT_LOADED : (status.get(territoire) ?? NOT_LOADED)

  const get = useCallback(
    (refType: ProgressRefType, slug: string, element: string): ProgressStatus => map[keyOf(territoire, refType, slug, element)] ?? 'a_faire',
    [map, territoire],
  )

  const set = useCallback(async (refType: ProgressRefType, slug: string, element: string, statut: ProgressStatus) => {
    if (!status.get(territoire)?.ready) throw new DataError('Progression en cours de chargement, réessayez dans un instant.', 'not_ready')
    const k = keyOf(territoire, refType, slug, element)
    const previous = state[k]
    state = { ...state, [k]: statut }
    emit()
    try {
      await persist(territoire, refType, slug, element, statut)
    } catch (e) {
      // Retour à l'état précédent si l'enregistrement en ligne échoue.
      const rollback = { ...state }
      if (previous) rollback[k] = previous
      else delete rollback[k]
      state = rollback
      emit()
      throw e
    }
  }, [territoire])

  const retry = useCallback(() => { void load(territoire) }, [territoire])

  return { get, set, ready: st.ready, error: st.error, retry }
}

/** Compte des éléments terminés / en cours parmi une liste. */
export function countProgress(statuses: ProgressStatus[]) {
  const termine = statuses.filter((s) => s === 'termine').length
  const enCours = statuses.filter((s) => s === 'en_cours').length
  return { termine, enCours, total: statuses.length, pourcent: statuses.length ? Math.round((termine / statuses.length) * 100) : 0 }
}
