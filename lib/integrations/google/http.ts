import 'server-only'
/**
 * Garde commune des routes /api/integrations/google/** :
 *   - identité revalidée (requireAuthedUser : getUser() + aal2 si facteur MFA) ;
 *   - contrôle d'origine sur les requêtes mutantes (défense CSRF en plus de
 *     SameSite=Lax des cookies de session).
 */
import type { NextRequest } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import { deniedMessage, requireAuthedUser } from '@/lib/auth/guard'
import { getCurrentUser } from '@/lib/auth/session'
import { jsonError } from '@/lib/data/server/http'
import { appUrl } from '@/lib/auth/redirect'

export type GoogleRouteContext =
  | { kind: 'live'; user: User; db: SupabaseClient }
  | { kind: 'demo' }
  | { kind: 'denied'; response: Response }

export async function guard(): Promise<GoogleRouteContext> {
  const ctx = await requireAuthedUser()
  if (ctx.ok) return { kind: 'live', user: ctx.user, db: ctx.supabase as unknown as SupabaseClient }
  const t = await getTranslations('server.google')
  if (ctx.reason === 'disabled') {
    // Mode démonstration : session de recette (cookie lp_demo), aucune intégration réelle.
    return (await getCurrentUser())
      ? { kind: 'demo' }
      : { kind: 'denied', response: jsonError(401, 'unauthenticated', t('sessionExpired')) }
  }
  if (ctx.reason === 'mfa_required') {
    return { kind: 'denied', response: jsonError(403, 'mfa_required', await deniedMessage('mfa_required')) }
  }
  return { kind: 'denied', response: jsonError(401, 'unauthenticated', t('sessionExpired')) }
}

/** Refuse une requête mutante venant d'un autre site (Origin / Sec-Fetch-Site). */
export function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  if (!origin) return true
  return origin === req.nextUrl.origin || origin === appUrl()
}

export async function crossSite() {
  const t = await getTranslations('server.google')
  return jsonError(403, 'cross_site', t('crossSite'))
}
