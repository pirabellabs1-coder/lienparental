import 'server-only'
/**
 * Session courante côté serveur (Server Components, Route Handlers, Server Actions).
 *
 * - Supabase configuré : identité issue de supabase.auth.getUser() (JWT revalidé
 *   auprès de GoTrue, jamais un simple décodage du cookie), profil lu dans
 *   public.users, offre lue dans public.subscriptions, rôle admin via RPC is_admin().
 * - Mode démonstration : identité dérivée du cookie lp_demo (non probante, recette uniquement).
 * - Ni l'un ni l'autre : aucune session.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { DEMO_ACCOUNTS, DEMO_COOKIE, DEMO_MODE, isDemoAccountId } from '@/lib/demo-auth'
import { createClient, type TypedSupabaseClient } from '@/lib/supabase/server'
import { planOf } from '@/lib/billing/sync-core'

export type CurrentUser = {
  id: string
  email: string
  prenom: string
  nom: string
  plan: 'gratuit' | 'premium'
  /** Administrateur (rôle vérifié en base). La 2FA n'est pas exigée pour l'admin. */
  isAdmin: boolean
}

async function loadSupabaseUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  // Double authentification activée mais pas encore validée pour cette session :
  // l'utilisateur n'est pas considéré comme connecté (évite le contournement du code TOTP).
  const aal = await assuranceLevel(supabase)
  if (!aal || (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2')) return null

  const [profile, subscription, admin] = await Promise.all([
    supabase.from('users').select('email, prenom, nom, deleted_at').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, current_period_start, plan').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('is_admin'),
  ])
  const adminRole = admin.data === true

  // Compte en cours de suppression : on le traite comme déconnecté.
  if (profile.data?.deleted_at) return null

  const meta = (user.user_metadata ?? {}) as { prenom?: unknown; nom?: unknown }
  return {
    id: user.id,
    email: profile.data?.email ?? user.email ?? '',
    prenom: profile.data?.prenom ?? (typeof meta.prenom === 'string' ? meta.prenom : ''),
    nom: profile.data?.nom ?? (typeof meta.nom === 'string' ? meta.nom : ''),
    // Même règle d'accès que la facturation (lib/billing/sync-core#planOf) : actif, essai,
    // ou paiement en échec encore dans le délai de grâce.
    plan: subscription.data && planOf(subscription.data as Parameters<typeof planOf>[0]) !== 'gratuit' ? 'premium' : 'gratuit',
    // La 2FA n'est pas imposée pour l'admin : l'accès repose sur le lien secret
    // (porte masquée) + le rôle vérifié en base. Si l'admin a activé une 2FA, la
    // vérification aal (plus haut) s'applique déjà comme pour tout utilisateur.
    isAdmin: adminRole,
  }
}

type Aal = { currentLevel: string | null; nextLevel: string | null }

async function assuranceLevel(supabase: TypedSupabaseClient): Promise<Aal | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return null
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel }
}

/** true si la session atteint le niveau d'assurance exigé (aal2 quand un facteur TOTP vérifié existe). */
export async function hasRequiredAal(supabase: TypedSupabaseClient): Promise<boolean> {
  const data = await assuranceLevel(supabase)
  if (!data) return false
  return !(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2')
}

/**
 * Garde des routes et pages d'administration (M7, audit v3) : la session doit être
 * aal2, c'est-à-dire qu'un facteur TOTP vérifié existe ET a été saisi pour cette
 * session. Fail-closed : toute erreur vaut false.
 */
export async function isAal2(supabase: TypedSupabaseClient): Promise<boolean> {
  const data = await assuranceLevel(supabase)
  return data?.currentLevel === 'aal2'
}

async function loadDemoUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const id = store.get(DEMO_COOKIE)?.value
  if (!isDemoAccountId(id)) return null
  if (id === 'nouveau') {
    return { id: 'demo-nouveau', email: '', prenom: '', nom: '', plan: 'gratuit', isAdmin: false }
  }
  const account = DEMO_ACCOUNTS.find(a => a.id === id)
  if (!account) return null
  return {
    id: `demo-${account.id}`,
    email: account.email,
    prenom: account.id === 'admin' ? 'Admin' : 'Julie',
    nom: account.id === 'admin' ? 'Lien Parental' : 'Martin',
    plan: account.id === 'parent-premium' ? 'premium' : 'gratuit',
    isAdmin: account.id === 'admin',
  }
}

/** Mémoïsé par requête (React cache) : plusieurs appels = une seule résolution. */
const resolveCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (SUPABASE_ENABLED) return loadSupabaseUser()
  if (DEMO_MODE) return loadDemoUser()
  return null
})

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return resolveCurrentUser()
}
