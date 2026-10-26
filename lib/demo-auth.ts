// Comptes de démonstration (sans backend) pour la recette.
// Actif en développement, désactivé par défaut en production :
//   NEXT_PUBLIC_DEMO_MODE=on  → force l'activation (pré-production de démonstration)
//   NEXT_PUBLIC_DEMO_MODE=off → force la désactivation
// À désactiver dès que l'authentification Supabase est branchée : le cookie de démo n'est pas une preuve d'identité.

export type DemoAccountId = 'parent-gratuit' | 'parent-premium' | 'admin' | 'nouveau'

export type DemoAccount = {
  id: Exclude<DemoAccountId, 'nouveau'>
  label: string
  email: string
  password: string
  plan: 'gratuit' | 'premium'
  home: string
}

import { SUPABASE_ENABLED } from '@/lib/supabase/config'

const flag = process.env.NEXT_PUBLIC_DEMO_MODE
// Dès que Supabase est configuré, la vraie authentification remplace les comptes de démonstration.
export const DEMO_MODE = !SUPABASE_ENABLED && (flag === 'on' || (flag !== 'off' && process.env.NODE_ENV !== 'production'))

export const DEMO_COOKIE = 'lp_demo'
export const DEMO_SESSION_SECONDS = 8 * 60 * 60

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'parent-gratuit', label: 'Parent · offre Gratuite', email: 'julie.gratuit@demo.lienparental.fr', password: 'Demo2026!', plan: 'gratuit', home: '/app' },
  { id: 'parent-premium', label: 'Parent · offre Premium', email: 'julie.premium@demo.lienparental.fr', password: 'Demo2026!', plan: 'premium', home: '/app' },
  { id: 'admin', label: 'Administrateur', email: 'admin@demo.lienparental.fr', password: 'Demo2026!', plan: 'gratuit', home: '/admin' },
]

export function findDemoAccount(email: string, password: string) {
  const e = email.trim().toLowerCase()
  return DEMO_ACCOUNTS.find(a => a.email === e && a.password === password) ?? null
}

export function isDemoAccountId(v: string | undefined | null): v is DemoAccountId {
  return v === 'parent-gratuit' || v === 'parent-premium' || v === 'admin' || v === 'nouveau'
}

/** Côté navigateur : ouvre une session de démo temporaire. */
export function startDemoSession(id: DemoAccountId) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${DEMO_COOKIE}=${id}; path=/; max-age=${DEMO_SESSION_SECONDS}; samesite=lax${secure}`
}

/** Côté navigateur : ferme la session de démo. */
export function endDemoSession() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`
  try { sessionStorage.clear() } catch { /* stockage indisponible */ }
}
