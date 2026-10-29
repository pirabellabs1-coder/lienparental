import 'server-only'
/**
 * Socle des routes /api/coparents/** : session revalidée (requireAuthedUser,
 * aal2 si la 2FA est active), client Supabase RLS de l'utilisateur, limitation
 * de débit et traduction des erreurs SQL de 0340 en enveloppe JSON homogène.
 * L'identité vient exclusivement de auth.getUser(), jamais du corps de requête.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { getTranslations } from 'next-intl/server'
import { deniedMessage, requireAuthedUser } from '@/lib/auth/guard'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { sameOrigin } from '@/lib/contenus/api'

export type FamilyCtx = { db: SupabaseClient; user: User }

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * `req` : obligatoire pour toute route qui modifie l'état (POST / PATCH / PUT / DELETE).
 * Anti-CSRF (m6, audit v3) : même contrôle d'en-tête Origin que /api/admin
 * (`sameOrigin`, lib/contenus/api.ts), en plus du cookie SameSite=Lax.
 */
export async function familyContext(req?: Request): Promise<FamilyCtx | { error: NextResponse }> {
  if (req && !SAFE_METHODS.has(req.method.toUpperCase()) && !sameOrigin(req)) {
    const t = await getTranslations('server.coparents')
    return { error: jsonError(403, 'bad_origin', t('badOrigin')) }
  }
  if (!SUPABASE_ENABLED) {
    const t = await getTranslations('server.coparents')
    return { error: jsonError(503, 'not_configured', t('notConfigured')) }
  }
  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? { error: jsonError(403, 'mfa_required', await deniedMessage('mfa_required')) }
      : { error: jsonError(401, 'unauthenticated', await deniedMessage('unauthenticated')) }
  }
  // Les RPC 0340 ne figurent pas dans les types générés.
  return { db: auth.supabase as unknown as SupabaseClient, user: auth.user }
}

/** null si la requête est autorisée, sinon une réponse 429 (compteur partagé, fail-open). */
export async function limited(userId: string, bucket: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const r = await rateLimit(userKey(`coparents:${bucket}`, userId), limit, windowMs)
  if (r.ok) return null
  const t = await getTranslations('server.coparents')
  return jsonError(429, 'rate_limited', t('rateLimited'), { 'Retry-After': String(r.retryAfter) })
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > 16_384) return null
  return req.json().catch(() => null)
}

type PgError = { code?: string; hint?: string | null; message?: string }

/** Indice SQL → statut HTTP ; message : server.coparents.hints.<indice> (mfa_required : message d'authentification). */
const HINTS: Record<string, number> = {
  mfa_required: 403,
  not_allowed: 403,
  owner_only: 403,
  invalid_email: 422,
  invalid_role: 422,
  invalid_children: 422,
  self_invite: 422,
  birthdate_mismatch: 422,
  merge_incomplete: 409,
  invalid_payload: 422,
  cooldown: 429,
  too_many: 429,
  // 2 adultes au maximum par enfant : titulaire + 1 parent invité (0520).
  adult_limit: 409,
}

/**
 * Erreur Postgres/PostgREST → réponse JSON. Journalise l'opération et le code
 * uniquement (jamais d'e-mail, de jeton ni de contenu).
 */
export async function rpcError(err: unknown, op: string, notFound?: string): Promise<NextResponse> {
  const e = (err ?? {}) as PgError
  const code = String(e.code ?? 'unknown')
  const hint = e.hint ?? ''
  const t = await getTranslations('server.coparents')
  if (hint && Object.prototype.hasOwnProperty.call(HINTS, hint)) {
    const message = hint === 'mfa_required' ? await deniedMessage('mfa_required') : t(`hints.${hint}`)
    return jsonError(HINTS[hint], hint, message)
  }
  if (code === '23505') return jsonError(409, 'already_pending', t('alreadyPending'))
  if (code === 'P0002' || code === 'PGRST116') return jsonError(404, 'not_found', notFound ?? t('notFound'))
  if (code === '42501') return jsonError(403, 'forbidden', t('hints.not_allowed'))
  if (code === '22023' || code === '22P02' || code === '23514') return jsonError(422, 'invalid', t('invalid'))
  if (code === '54000') return jsonError(429, 'too_many', t('tooManyLater'))
  console.warn(`[api/coparents] ${op} a échoué (code ${code})`)
  return jsonError(500, 'db_error', t('dbError'))
}

/** URL publique de l'application (jamais déduite de l'en-tête Host). */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  try {
    if (raw) return new URL(raw).origin
  } catch { /* valeur invalide : repli */ }
  return 'https://lienparental.fr'
}

export function invitationLink(token: string): string {
  return `${appUrl()}/app/coparents/invitation/${token}`
}
