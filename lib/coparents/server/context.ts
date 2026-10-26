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
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
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
    return { error: jsonError(403, 'bad_origin', 'Requête refusée (origine inattendue).') }
  }
  if (!SUPABASE_ENABLED) {
    return { error: jsonError(503, 'not_configured', 'La liaison des parents nécessite un compte réel (mode démonstration).') }
  }
  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? { error: jsonError(403, 'mfa_required', DENIED_MESSAGES.mfa_required) }
      : { error: jsonError(401, 'unauthenticated', DENIED_MESSAGES.unauthenticated) }
  }
  // Les RPC 0340 ne figurent pas dans les types générés.
  return { db: auth.supabase as unknown as SupabaseClient, user: auth.user }
}

/** null si la requête est autorisée, sinon une réponse 429 (compteur partagé, fail-open). */
export async function limited(userId: string, bucket: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const r = await rateLimit(userKey(`coparents:${bucket}`, userId), limit, windowMs)
  return r.ok ? null : jsonError(429, 'rate_limited', 'Trop de demandes rapprochées. Réessayez dans un instant.', { 'Retry-After': String(r.retryAfter) })
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > 16_384) return null
  return req.json().catch(() => null)
}

type PgError = { code?: string; hint?: string | null; message?: string }

const HINTS: Record<string, [number, string]> = {
  mfa_required: [403, DENIED_MESSAGES.mfa_required],
  not_allowed: [403, 'Vous n’avez pas les droits nécessaires pour cette action.'],
  owner_only: [403, 'Seul le parent titulaire de la fiche peut ajouter un autre parent. Vous pouvez inviter un proche, ou demander au titulaire d’envoyer l’invitation.'],
  invalid_email: [422, 'Adresse e-mail invalide.'],
  invalid_role: [422, 'Rôle invalide.'],
  invalid_children: [422, 'Choisissez au moins un enfant.'],
  self_invite: [422, 'Vous ne pouvez pas vous inviter vous-même.'],
  birthdate_mismatch: [422, 'Les dates de naissance ne correspondent pas : ces fiches ne peuvent pas être fusionnées.'],
  merge_incomplete: [409, 'Les informations de santé ont changé pendant la fusion. Réessayez.'],
  invalid_payload: [422, 'Requête invalide.'],
  cooldown: [429, 'Patientez une minute avant de renvoyer l’invitation.'],
  too_many: [429, 'Limite atteinte pour aujourd’hui. Réessayez demain.'],
}

/**
 * Erreur Postgres/PostgREST → réponse JSON. Journalise l'opération et le code
 * uniquement (jamais d'e-mail, de jeton ni de contenu).
 */
export function rpcError(err: unknown, op: string, notFound = 'Élément introuvable.'): NextResponse {
  const e = (err ?? {}) as PgError
  const code = String(e.code ?? 'unknown')
  const hint = e.hint ?? ''
  if (hint && HINTS[hint]) {
    const [status, message] = HINTS[hint]
    return jsonError(status, hint, message)
  }
  if (code === '23505') return jsonError(409, 'already_pending', 'Une invitation est déjà en attente pour cette adresse : renvoyez-la ou annulez-la.')
  if (code === 'P0002' || code === 'PGRST116') return jsonError(404, 'not_found', notFound)
  if (code === '42501') return jsonError(403, 'forbidden', 'Vous n’avez pas les droits nécessaires pour cette action.')
  if (code === '22023' || code === '22P02' || code === '23514') return jsonError(422, 'invalid', 'Certaines informations sont invalides.')
  if (code === '54000') return jsonError(429, 'too_many', 'Limite atteinte. Réessayez plus tard.')
  console.warn(`[api/coparents] ${op} a échoué (code ${code})`)
  return jsonError(500, 'db_error', 'Opération impossible pour le moment. Réessayez dans un instant.')
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
