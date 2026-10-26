import 'server-only'
/**
 * Configuration de l'intégration Google Agenda (serveur uniquement).
 *
 * L'intégration ne s'active que si TOUT est présent : Supabase (+ service_role,
 * les jetons ne sont lisibles qu'avec elle), client OAuth Google, URI de
 * redirection valide et clé de chiffrement des jetons. Sinon l'interface
 * explique que la connexion n'est pas configurée (fail closed).
 *
 * NB : la connexion « Continuer avec Google » (Supabase Auth) n'utilise PAS ces
 * variables : son client OAuth est saisi dans le dashboard Supabase.
 */
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { tokenCryptoReady } from './crypto'

export const CALLBACK_PATH = '/api/integrations/google/calendar/callback'
/** Cookie HttpOnly chiffré portant state + code_verifier + nonce le temps de l'aller-retour Google. */
export const STATE_COOKIE = 'lp_gcal_oauth'
export const STATE_TTL_S = 600

/** Portées : on ne demande que ce que la cible choisie exige (+ openid email pour afficher le compte relié). */
export const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events'
/** Créer un agenda secondaire et gérer SES événements uniquement (aucun accès aux autres agendas). */
export const SCOPE_APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created'
export const BASE_SCOPES = ['openid', 'email']

export type GoogleOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string }

function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return (u.protocol === 'https:' || (local && u.protocol === 'http:')) && u.pathname === CALLBACK_PATH && !u.search && !u.hash
  } catch {
    return false
  }
}

export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? ''
  if (!clientId || !clientSecret || !redirectUri || !validRedirect(redirectUri)) return null
  return { clientId, clientSecret, redirectUri }
}

export function googleCalendarConfigured(): boolean {
  return SUPABASE_ENABLED
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    && googleOAuthConfig() !== null
    && tokenCryptoReady()
}

export function scopesFor(target: 'dedicated' | 'primary'): string[] {
  return [...BASE_SCOPES, target === 'dedicated' ? SCOPE_APP_CREATED : SCOPE_EVENTS]
}

/** true si les portées accordées permettent d'écrire dans la cible. */
export function scopesAllow(granted: string, target: 'dedicated' | 'primary'): boolean {
  const set = new Set(granted.split(/\s+/).filter(Boolean))
  // calendar.events suffit aussi pour un agenda déjà créé, mais pas pour en créer un.
  return target === 'dedicated' ? set.has(SCOPE_APP_CREATED) : set.has(SCOPE_EVENTS)
}
