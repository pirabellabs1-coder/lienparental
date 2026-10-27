'use client'

/**
 * Socle de la couche de données (navigateur).
 *
 * - `LIVE` : vrai dès que Supabase est configuré (sinon mode démonstration).
 * - Le client Supabase est volontairement « non typé » ici : les types
 *   générés vivent dans lib/supabase/types.ts (géré ailleurs) et ne couvrent
 *   pas encore les tables/colonnes ajoutées par 0210. Chaque module de
 *   lib/data déclare ses propres types de lignes et caste avec prudence.
 * - L'identité vient TOUJOURS de la session (`auth.getUser()`), jamais d'un
 *   paramètre client. La RLS (user_id = auth.uid()) reste le garde-fou final.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { libT } from '@/lib/i18n/runtime'

export const LIVE = SUPABASE_ENABLED

/**
 * Message affichable de la couche de données, dans la langue de l'interface
 * (catalogue `shared.data`, français côté serveur). Résolu à l'appel, jamais au chargement du module.
 */
export function dataMsg(key: string, values?: Record<string, string | number>): string {
  return libT('shared.data')(key, values)
}

/** Bucket Storage privé des documents (coffre-fort, images du journal, justificatifs). */
export const DOCUMENTS_BUCKET = 'documents'
/** Durée de validité des URL signées (secondes) : 15 minutes. */
export const SIGNED_URL_TTL = 900

let browserClient: SupabaseClient | null = null

/** Client Supabase navigateur (singleton). À n'appeler que si `LIVE`. */
export function db(): SupabaseClient {
  if (!LIVE) throw new DataError(dataMsg('errors.notConfigured'), 'not_configured')
  if (!browserClient) browserClient = createClient() as unknown as SupabaseClient
  return browserClient
}

/** Erreur métier affichable telle quelle (message en français, sans donnée personnelle). */
export class DataError extends Error {
  readonly code: string
  constructor(message: string, code = 'unknown') {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}

type PgLikeError = { code?: string; message?: string; status?: number; statusCode?: string | number }

/**
 * Convertit une erreur Supabase/Postgres/réseau en DataError française.
 * Journalise uniquement l'opération et le code (jamais le contenu ni l'identité).
 */
export function toDataError(err: unknown, op: string, fallback?: string): DataError {
  if (err instanceof DataError) return err
  const e = (err ?? {}) as PgLikeError
  const code = String(e.code ?? e.statusCode ?? e.status ?? 'unknown')
  console.warn(`[data] ${op} a échoué (code ${code})`)
  if (code === '23505') return new DataError(dataMsg('errors.duplicate'), code)
  if (code === '23503') return new DataError(dataMsg('errors.relatedNotFound'), code)
  if (code === '23514' || code === '22P02' || code === '22023') return new DataError(dataMsg('errors.invalid'), code)
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
    return new DataError(dataMsg('errors.forbidden'), code)
  }
  if (code === 'P0002' || code === 'PGRST116' || code === '404') return new DataError(dataMsg('errors.notFound'), code)
  if (code === '413') return new DataError(dataMsg('errors.fileTooLarge'), code)
  if (err instanceof TypeError) return new DataError(dataMsg('errors.network'), 'network')
  return new DataError(fallback ?? dataMsg('errors.generic'), code)
}

/** Identifiant de l'utilisateur connecté (revalidé auprès de Supabase Auth). */
export async function requireUserId(): Promise<string> {
  const { data, error } = await db().auth.getUser()
  if (error || !data.user) throw new DataError(dataMsg('errors.sessionExpired'), 'no_session')
  return data.user.id
}

export function uuid(): string {
  return crypto.randomUUID()
}

/** Nom de fichier sûr pour un chemin Storage : ASCII, sans séparateur, ≤ 80 caractères. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'fichier'
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : ''
  return ext ? `${base}.${ext}` : base
}

/** Jeton aléatoire base62 (crypto.getRandomValues, rejet du biais modulo). */
export function randomToken(len = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const out: string[] = []
  while (out.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len * 2))
    for (const b of bytes) {
      if (b < 248 && out.length < len) out.push(alphabet[b % 62])
    }
  }
  return out.join('')
}

// --- Dates ---------------------------------------------------------------------
// Plus de dates « locales » (fuseau du navigateur) : tout passe par lib/tz (DEFAULT_TZ).

// --- Hook générique ---------------------------------------------------------

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: DataError | null
  refresh: () => Promise<void>
  /** Mise à jour optimiste locale (sans recharger). */
  setData: (updater: T | ((prev: T | null) => T)) => void
}

/**
 * Charge une ressource au montage (côté client uniquement → pas d'écart
 * d'hydratation) et à chaque changement de `key`. Ignore les réponses
 * obsolètes (navigation rapide) et expose `refresh`.
 */
export function useAsyncData<T>(loader: () => Promise<T>, key: string, initial?: T): AsyncState<T> {
  // `initial` (démo uniquement) : valeur synchrone identique serveur/client, affichée
  // sans écran de chargement pendant que le loader applique les surcharges locales.
  const [data, setDataState] = useState<T | null>(initial ?? null)
  const [loading, setLoading] = useState(initial === undefined)
  const [error, setError] = useState<DataError | null>(null)
  const seq = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const initialRef = useRef(initial)

  const run = useCallback(async () => {
    const id = ++seq.current
    setLoading((l) => l || initialRef.current === undefined)
    setError(null)
    try {
      const v = await loaderRef.current()
      if (id === seq.current) setDataState(v)
    } catch (e) {
      if (id === seq.current) setError(toDataError(e, `load:${key}`))
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void run()
  }, [run])

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater))
  }, [])

  return { data, loading, error, refresh: run, setData }
}
