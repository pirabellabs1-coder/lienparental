import 'server-only'
/**
 * Limiteur de débit PARTAGÉ entre instances serverless (Vercel), adossé à
 * Postgres (Supabase) : table `rate_limits` + fonction atomique
 * `rate_limit_hit` (migration 0390_rate_limit.sql), appelée avec la clé
 * service_role. Aucun service externe supplémentaire.
 *
 * Algorithme : fenêtre fixe alignée sur l'epoch (comptage exact à l'intérieur
 * d'une fenêtre ; jusqu'à 2 × limit possible à cheval sur deux fenêtres,
 * assumé). Un compteur mémoire local est consulté d'abord : il coupe les
 * rafales d'une même instance sans aller-retour en base.
 *
 * Modes et pannes :
 *  - démo (Supabase non configuré) : compteur mémoire seul ;
 *  - limiteur partagé injoignable (erreur RPC, délai > RPC_TIMEOUT_MS, clé
 *    service_role absente) :
 *      · par défaut FAIL-OPEN : on retombe sur le compteur mémoire (protection
 *        dégradée par instance, mais le service reste rendu) ;
 *      · `{ failClosed: true }` (coffre, codes avocat, témoin) : refus
 *        `reason: 'unavailable'` → 503. Mieux vaut indisponible que brute-forçable.
 *  - coupe-circuit : après un échec, la base n'est plus sollicitée pendant
 *    BREAKER_MS (pas de délai d'attente ajouté à chaque requête pendant une panne).
 *
 * Clés : construire avec ipKey / userKey / tokenKey (jamais d'IP ni de jeton en
 * clair). En base, la clé est de toute façon réduite à `famille:empreinte`.
 */
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED, SUPABASE_URL } from '@/lib/supabase/config'
import { jsonError } from './http'
import {
  MemoryLimiter, retryAfterSeconds, storageKey, windowSeconds, type RateLimitResult,
} from './rate-limit-core'

export { clientIp, ipKey, tokenKey, userKey, type RateLimitResult } from './rate-limit-core'

export type RateLimitOptions = {
  /** Refuser (503) si le limiteur partagé est indisponible, au lieu du repli mémoire. */
  failClosed?: boolean
}

const RPC_TIMEOUT_MS = 1_500
const BREAKER_MS = 15_000
/** Délai conseillé au client quand le limiteur est indisponible (fail-closed). */
const UNAVAILABLE_RETRY_S = 30

const g = globalThis as unknown as {
  __lpRateMemory?: MemoryLimiter
  __lpRateDb?: SupabaseClient | null
  __lpRateDownUntil?: number
}

function memory(): MemoryLimiter {
  if (!g.__lpRateMemory) g.__lpRateMemory = new MemoryLimiter()
  return g.__lpRateMemory
}

/** Client service_role dédié (sans session), ou null si la clé manque. */
function db(): SupabaseClient | null {
  if (g.__lpRateDb !== undefined) return g.__lpRateDb
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !key) {
    console.warn('[rate-limit] SUPABASE_SERVICE_ROLE_KEY absent : limiteur partagé inactif (repli mémoire / 503 sur routes sensibles)')
    g.__lpRateDb = null
    return null
  }
  g.__lpRateDb = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return g.__lpRateDb
}

function unavailable(): RateLimitResult {
  return { ok: false, reason: 'unavailable', retryAfter: UNAVAILABLE_RETRY_S }
}

/** Limiteur partagé indisponible : 503 si fail-closed, sinon verdict du compteur local (déjà favorable). */
function degraded(opts?: RateLimitOptions): RateLimitResult {
  return opts?.failClosed ? unavailable() : { ok: true }
}

/**
 * Compte une requête pour `key` et indique si `limit` est dépassé sur `windowMs`.
 * Asynchrone : interroge le compteur partagé en base quand Supabase est configuré.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, opts?: RateLimitOptions): Promise<RateLimitResult> {
  // 1. Filet local (toujours) : rafale sur cette instance → refus sans appel réseau.
  const local = memory().hit(key, limit, windowMs)
  if (!local.ok) return local

  // 2. Mode démo : le compteur mémoire est la seule référence.
  if (!SUPABASE_ENABLED) return local

  const client = db()
  if (!client) return degraded(opts)

  const now = Date.now()
  if ((g.__lpRateDownUntil ?? 0) > now) return degraded(opts)

  const w = windowSeconds(windowMs)
  try {
    const { data, error } = await client
      .rpc('rate_limit_hit', { p_key: storageKey(key), p_limit: Math.max(0, Math.floor(limit)), p_window_seconds: w })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (error || typeof data !== 'boolean') throw new Error(error?.code ?? error?.message ?? 'invalid_response')
    if (data) return { ok: true }
    return { ok: false, reason: 'limited', retryAfter: retryAfterSeconds(Date.now(), w) }
  } catch (e) {
    g.__lpRateDownUntil = Date.now() + BREAKER_MS
    console.warn('[rate-limit] limiteur partagé indisponible, coupe-circuit 15 s :', e instanceof Error ? e.message.slice(0, 120) : 'unknown')
    return degraded(opts)
  }
}

/**
 * Réponse JSON standard pour un refus du limiteur :
 * 429 + Retry-After (quota), ou 503 + Retry-After (limiteur indisponible, fail-closed).
 */
export function rateLimitedResponse(
  rl: Extract<RateLimitResult, { ok: false }>,
  message = 'Trop de demandes. Patientez un instant.',
  headers?: Record<string, string>,
) {
  const h = { ...headers, 'Retry-After': String(rl.retryAfter) }
  return rl.reason === 'unavailable'
    ? jsonError(503, 'unavailable', 'Service momentanément indisponible. Réessayez dans un instant.', h)
    : jsonError(429, 'rate_limited', message, h)
}

/**
 * Empreinte salée de l'IP (preuve légère, RGPD : jamais l'IP en clair).
 * Sans sel configuré, on ne calcule rien (null) plutôt qu'un hash réversible par dictionnaire.
 */
export function ipHash(ip: string): string | null {
  const salt = process.env.IP_HASH_SALT || process.env.APP_ENCRYPTION_KEY
  if (!salt || ip === 'unknown') return null
  return createHmac('sha256', salt).update(ip).digest('hex')
}
