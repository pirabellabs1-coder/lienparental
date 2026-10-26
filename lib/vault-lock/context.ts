import 'server-only'
/**
 * Identité du parent pour le verrou du coffre.
 * L'identifiant vient exclusivement de la session serveur (Supabase revalidée
 * via requireAuthedUser, ou cookie de démo en recette) : jamais du client.
 */
import type { User } from '@supabase/supabase-js'
import { requireAuthedUser } from '@/lib/auth/guard'
import { getCurrentUser } from '@/lib/auth/session'
import { DEMO_ACCOUNTS, DEMO_MODE } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { vaultSecretConfigured } from './crypto'

export type VaultPrincipal = {
  mode: 'live' | 'demo'
  userId: string
  email: string
  displayName: string
  /** claim session_id du JWT Supabase (null en démo). */
  sessionId: string | null
  hasPassword: boolean
  /**
   * Ré-authentification récente (moins de 5 minutes) : horodatage `amr` de la session
   * (claims vérifiés) ET `last_sign_in_at` du compte (GoTrue, revalidé par getUser()).
   */
  recentLogin: boolean
  user?: User
}

export type PrincipalDenied = { ok: false; reason: 'unauthenticated' | 'mfa_required' | 'not_configured' }

export const RECENT_LOGIN_MS = 5 * 60 * 1000

/**
 * Le verrou peut-il fonctionner sur ce serveur : clé maîtresse (VAULT_LOCK_SECRET, ou secret
 * fixe en démonstration) et, en mode Supabase, clé service (réglages lus côté serveur).
 * Sinon le verrou est désactivé pour tous : le coffre reste accessible SANS verrou (il ne
 * bloque pas tout le monde) et les réglages affichent « Verrouillage non configuré ».
 */
export function vaultLockConfigured(): boolean {
  if (!vaultSecretConfigured()) return false
  return !SUPABASE_ENABLED || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Identité du parent. Par défaut, refuse avec `not_configured` si le verrou n'est pas
 * configuré (routes /api/vault-lock/**). `allowUnconfigured` : identité seule, pour ouvrir
 * le coffre sans verrou dans ce cas (garde des écrans et des routes de données du coffre).
 */
export async function resolvePrincipal(opts: { allowUnconfigured?: boolean } = {}): Promise<({ ok: true } & VaultPrincipal) | PrincipalDenied> {
  if (!opts.allowUnconfigured && !vaultLockConfigured()) return { ok: false, reason: 'not_configured' }

  if (SUPABASE_ENABLED) {
    const auth = await requireAuthedUser()
    if (!auth.ok) return { ok: false, reason: auth.reason === 'mfa_required' ? 'mfa_required' : 'unauthenticated' }
    const { user, supabase } = auth
    // Claims vérifiés (signature) : session_id et horodatage des méthodes d'authentification.
    let sessionId: string | null = null
    let recentLogin = false
    try {
      const { data } = await supabase.auth.getClaims()
      const claims = data?.claims as { session_id?: unknown; amr?: Array<{ timestamp?: number }> } | undefined
      if (typeof claims?.session_id === 'string') sessionId = claims.session_id
      const last = Math.max(0, ...(claims?.amr ?? []).map((a) => (typeof a.timestamp === 'number' ? a.timestamp * 1000 : 0)))
      // m5 (audit v3) : les deux horodatages doivent être récents. `amr` lie la preuve à
      // CETTE session ; `last_sign_in_at` (serveur d'authentification) empêche de
      // s'appuyer sur une session ancienne dont seul le jeton aurait été rafraîchi.
      const signIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0
      const fresh = (t: number) => t > 0 && Date.now() - t < RECENT_LOGIN_MS && t <= Date.now() + 60_000
      recentLogin = fresh(last) && fresh(signIn)
    } catch {
      /* claims indisponibles : liaison à la session et réinitialisation par reconnexion désactivées */
    }
    const meta = (user.user_metadata ?? {}) as { prenom?: unknown }
    return {
      ok: true,
      mode: 'live',
      userId: user.id,
      email: user.email ?? '',
      displayName: typeof meta.prenom === 'string' && meta.prenom ? meta.prenom : (user.email ?? 'Parent'),
      sessionId,
      hasPassword: (user.identities ?? []).some((i) => i.provider === 'email'),
      recentLogin,
      user,
    }
  }

  if (DEMO_MODE) {
    const u = await getCurrentUser()
    if (!u) return { ok: false, reason: 'unauthenticated' }
    const account = DEMO_ACCOUNTS.find((a) => `demo-${a.id}` === u.id)
    return {
      ok: true,
      mode: 'demo',
      userId: u.id,
      email: u.email,
      displayName: u.prenom || 'Parent',
      sessionId: null,
      hasPassword: Boolean(account),
      recentLogin: false,
    }
  }

  return { ok: false, reason: 'unauthenticated' }
}

/** Mot de passe de démonstration du compte connecté (null si inconnu). */
export function demoPasswordFor(userId: string): string | null {
  return DEMO_ACCOUNTS.find((a) => `demo-${a.id}` === userId)?.password ?? null
}

export { DEMO_MODE }
