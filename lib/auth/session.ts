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

export type CurrentUser = {
  id: string
  email: string
  prenom: string
  nom: string
  plan: 'gratuit' | 'premium'
  /** Administrateur ET session aal2 (TOTP validé) : seul cas où le back-office s'ouvre. */
  isAdmin: boolean
  /** Compte administrateur dont la session n'est pas aal2 (aucun facteur TOTP) : enrôlement 2FA exigé. */
  adminMfaRequired?: boolean
}

/** Page d'enrôlement de la double authentification (admins sans facteur). */
export const ADMIN_MFA_ENROLL_PATH = '/app/profil/securite/2fa?raison=admin'

const PREMIUM_STATUSES = ['active', 'trialing'] as const

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
    supabase.from('subscriptions').select('status').eq('user_id', user.id).in('status', [...PREMIUM_STATUSES]).maybeSingle(),
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
    plan: subscription.data ? 'premium' : 'gratuit',
    // M7 (audit v3) : les droits d'administration exigent une session aal2, même
    // si le compte n'a encore aucun facteur (la base applique is_admin_aal2()).
    isAdmin: adminRole && aal.currentLevel === 'aal2',
    adminMfaRequired: adminRole && aal.currentLevel !== 'aal2',
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
