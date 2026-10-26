import 'server-only'
/**
 * Client Anthropic (singleton serveur) + réglages du Coach IA.
 *
 * - Clé lue dans ANTHROPIC_API_KEY (jamais NEXT_PUBLIC_*), résolue par le SDK.
 * - Modèle : AI_MODEL (défaut claude-opus-5-5). Sur Opus 5.5, la réflexion est toujours
 *   active : on n'envoie ni `thinking: disabled` ni budget ; on règle `output_config.effort`.
 * - Pas de temperature / top_p / top_k, pas de pré-remplissage assistant.
 * - Repli serveur en cas de refus de sécurité : `fallbacks: "default"` + en-tête beta
 *   `server-side-fallback-2026-07-01` (désactivable via AI_FALLBACKS=off).
 * - Retries : le SDK réessaie 429/5xx avec backoff exponentiel + jitter (maxRetries).
 */
import Anthropic from '@anthropic-ai/sdk'
import { AI_ENABLED } from '@/lib/supabase/config'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const AI_MODEL = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

type Effort = 'low' | 'medium' | 'high'
function effortFromEnv(name: string, fallback: Effort): Effort {
  const v = process.env[name]?.trim()
  return v === 'low' || v === 'medium' || v === 'high' ? v : fallback
}

/** Analyse structurée : `medium` (défaut d'Opus 5.5, bon compromis qualité/coût). */
export const ANALYSIS_EFFORT: Effort = effortFromEnv('AI_ANALYSIS_EFFORT', 'medium')
/** Chat (assistant + suivi d'analyse) : `low` pour un premier token rapide. */
export const CHAT_EFFORT: Effort = effortFromEnv('AI_CHAT_EFFORT', 'low')

/** La réflexion compte dans max_tokens : on dimensionne pour réflexion + réponse. */
export const ANALYSIS_MAX_TOKENS = 12_000
export const CHAT_MAX_TOKENS = 8_000

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const
export const FALLBACKS_ENABLED = process.env.AI_FALLBACKS !== 'off'

/** Paramètres communs « repli serveur » à étaler dans client.beta.messages.*. */
export function fallbackParams(): { betas?: [typeof FALLBACK_BETA]; fallbacks?: 'default' } {
  return FALLBACKS_ENABLED ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}
}

let singleton: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!AI_ENABLED) throw new Error('AI not configured')
  if (!singleton) {
    singleton = new Anthropic({
      maxRetries: 2,
      timeout: 90_000,
    })
  }
  return singleton
}

// --- Erreurs -> messages français ------------------------------------------

export type AiFailure = { status: number; code: string; message: string; retryAfter?: number }

export function mapAiError(err: unknown): AiFailure {
  if (err instanceof Anthropic.APIUserAbortError) {
    return { status: 499, code: 'aborted', message: 'Demande annulée.' }
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, code: 'ai_timeout', message: 'Le Coach IA met trop de temps à répondre. Réessayez dans un instant.' }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, code: 'ai_unreachable', message: 'Le Coach IA est momentanément injoignable. Réessayez dans un instant.' }
  }
  if (err instanceof Anthropic.RateLimitError) {
    const ra = Number(err.headers?.get?.('retry-after'))
    return {
      status: 503,
      code: 'ai_busy',
      message: 'Le Coach IA est très sollicité. Réessayez dans une minute.',
      retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 60,
    }
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, code: 'ai_misconfigured', message: 'Le Coach IA est indisponible pour le moment.' }
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 422, code: 'ai_bad_request', message: 'Ce contenu ne peut pas être analysé. Vérifiez le fichier (format, lisibilité) et réessayez.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 503, code: 'ai_unavailable', message: 'Le Coach IA est momentanément indisponible. Réessayez dans un instant.' }
  }
  return { status: 500, code: 'internal', message: 'Une erreur est survenue. Réessayez dans un instant.' }
}

// --- Observabilité (aucune donnée personnelle) --------------------------------

// Tarifs Opus 5.5 ($ / million de tokens) — à revoir si AI_MODEL change.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }

type UsageLike = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function estimateCostUsd(u: UsageLike | null | undefined): number {
  if (!u) return 0
  const cost =
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.output_tokens ?? 0) * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
    1_000_000
  return Math.round(cost * 1e6) / 1e6
}

/**
 * Une ligne JSON par appel : route, modèle servi, version de prompt, latence, tokens, coût.
 * Jamais de contenu, d'identifiant utilisateur, d'e-mail ni de nom de fichier.
 */
export function logAiCall(entry: {
  route: 'analyze' | 'chat'
  model: string
  promptVersion: string
  effort: string
  latencyMs: number
  ttftMs?: number
  stopReason: string | null
  fallbackServed?: boolean
  usage?: UsageLike | null
  error?: string
}) {
  const line = {
    at: new Date().toISOString(),
    ...entry,
    usage: entry.usage
      ? {
          in: entry.usage.input_tokens ?? 0,
          out: entry.usage.output_tokens ?? 0,
          cache_write: entry.usage.cache_creation_input_tokens ?? 0,
          cache_read: entry.usage.cache_read_input_tokens ?? 0,
        }
      : undefined,
    cost_usd: estimateCostUsd(entry.usage),
  }
  console.info(`[coach-ai] ${JSON.stringify(line)}`)
}

/** Vrai si un modèle de repli a servi la réponse (signal fiable : usage.iterations). */
export function fallbackServed(msg: { usage?: { iterations?: Array<{ type: string }> | null } | null }): boolean {
  return (msg.usage?.iterations ?? []).some((it) => it.type === 'fallback_message')
}
