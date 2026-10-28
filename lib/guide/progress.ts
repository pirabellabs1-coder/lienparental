'use client'

/**
 * Progression du Guide (fiches et parcours).
 * - Démonstration : localStorage (protégé par try/catch, la page fonctionne sans).
 * - Supabase : table `guide_progress` (RLS user_id = auth.uid(), migration 0250).
 * Clé d'un élément : `<territoire>:<type>:<slug>:<element>` (même clé que la contrainte unique 0280).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { DataError, LIVE, db, requireUserId, toDataError } from '@/lib/data/core'
import { libT } from '@/lib/i18n/runtime'
import { PROGRESS_STATUSES, type ProgressRefType, type ProgressStatus } from './types'
import { parcoursElementStatus, parcoursElementWrites, persistOrResync } from './progress-rules'

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
      setStatus(territoire, { ready: false, error: toDataError(e, 'guide_progress.select', libT('shared.guide')('loadFailed')).message })
    }
  })()
  loads.set(territoire, p)
  return p
}

/**
 * Recharge la progression d'un territoire depuis la base et REMPLACE ses clés locales
 * (les valeurs optimistes non confirmées disparaissent, celles déjà enregistrées restent).
 * En démonstration (localStorage), l'état local est la source : rien à recharger.
 */
async function resync(territoire: string): Promise<void> {
  if (!LIVE) return
  const { data, error } = await db().from('guide_progress').select('ref_type, ref_slug, element, statut').eq('territoire', territoire)
  if (error) throw error
  const prefix = `${territoire}:`
  const next: ProgressMap = {}
  for (const [k, v] of Object.entries(state)) if (!k.startsWith(prefix)) next[k] = v
  for (const r of (data ?? []) as Row[]) if (isStatus(r.statut)) next[keyOf(territoire, r.ref_type, r.ref_slug, r.element)] = r.statut
  state = next
  emit()
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
    throw toDataError(e, 'guide_progress.upsert', libT('shared.guide')('saveFailed'))
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
    if (!status.get(territoire)?.ready) throw new DataError(libT('shared.guide')('notReady'), 'not_ready')
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

  /** Statut effectif d'une étape de parcours (partagé avec sa fiche liée, cf. progress-rules). */
  const getParcoursElement = useCallback(
    (parcoursSlug: string, element: { id: string; fiche?: string }): ProgressStatus =>
      parcoursElementStatus((r, s, e) => map[keyOf(territoire, r, s, e)], parcoursSlug, element),
    [map, territoire],
  )

  /**
   * Change une étape de parcours ET sa fiche liée (même démarche). Écritures successives, fiche
   * d'abord (source de vérité) ; en cas d'échec, l'état est rechargé depuis la base (une écriture
   * déjà acceptée reste affichée) plutôt que remis localement à sa valeur d'avant.
   */
  const setParcoursElement = useCallback(async (parcoursSlug: string, element: { id: string; fiche?: string }, statut: ProgressStatus) => {
    if (!status.get(territoire)?.ready) throw new DataError(libT('shared.guide')('notReady'), 'not_ready')
    const writes = parcoursElementWrites(parcoursSlug, element)
    const before = { ...state }
    const next = { ...state }
    for (const w of writes) next[keyOf(territoire, w.refType, w.slug, w.element)] = statut
    state = next
    emit()
    await persistOrResync(
      writes,
      (w) => persist(territoire, w.refType, w.slug, w.element, statut),
      async () => {
        try {
          await resync(territoire)
        } catch (e) {
          // Base injoignable : état réel inconnu. Retour arrière local en repli, et progression
          // marquée « non chargée » avec l'erreur (bouton Réessayer, qui relit la base).
          const rollback = { ...state }
          for (const w of writes) {
            const k = keyOf(territoire, w.refType, w.slug, w.element)
            if (k in before) rollback[k] = before[k]
            else delete rollback[k]
          }
          state = rollback
          loads.delete(territoire)
          setStatus(territoire, { ready: false, error: toDataError(e, 'guide_progress.select', libT('shared.guide')('loadFailed')).message })
        }
      },
    )
  }, [territoire])

  const retry = useCallback(() => { void load(territoire) }, [territoire])

  return { get, set, getParcoursElement, setParcoursElement, ready: st.ready, error: st.error, retry }
}

/** Compte des éléments terminés / en cours parmi une liste. */
export function countProgress(statuses: ProgressStatus[]) {
  const termine = statuses.filter((s) => s === 'termine').length
  const enCours = statuses.filter((s) => s === 'en_cours').length
  return { termine, enCours, total: statuses.length, pourcent: statuses.length ? Math.round((termine / statuses.length) * 100) : 0 }
}
