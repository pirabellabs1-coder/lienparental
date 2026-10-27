'use server'
import { cookies } from 'next/headers'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { requireAuthedUser } from '@/lib/auth/guard'
import { isLocale, LOCALE_COOKIE } from './config'

/**
 * Langue affichée = cookie lp_locale (lu par i18n/request.ts).
 * Langue du compte = public.preferences.langue (RLS : chacun sa ligne).
 * Tout choix explicite écrit les deux, pour qu'ils ne divergent jamais.
 */

/**
 * Mémorise la langue choisie dans le cookie lp_locale (un an).
 * Non HttpOnly : aucune donnée sensible, et une préférence d'affichage.
 * Le composant appelle ensuite router.refresh() pour re-rendre dans la nouvelle langue.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}

/**
 * Choix explicite de langue (drapeaux, Préférences > Général) : cookie d'affichage
 * + préférence du compte si l'utilisateur est connecté. Hors connexion : cookie seul.
 */
export async function applyLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  await setLocale(locale)
  if (!SUPABASE_ENABLED) return
  const auth = await requireAuthedUser()
  if (!auth.ok) return
  await auth.supabase.from('preferences').update({ langue: locale }).eq('user_id', auth.user.id)
}

/**
 * Nouvel appareil (aucun cookie de langue) : on reprend la langue enregistrée sur le compte.
 * Si un cookie existe déjà, c'est le dernier choix explicite fait sur cet appareil : on n'y touche pas.
 * Renvoie true si l'affichage doit être rafraîchi (langue du compte ≠ français par défaut).
 */
export async function syncLocaleFromProfile(): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false
  const store = await cookies()
  if (store.get(LOCALE_COOKIE)) return false
  const auth = await requireAuthedUser()
  if (!auth.ok) return false
  const { data } = await auth.supabase.from('preferences').select('langue').eq('user_id', auth.user.id).maybeSingle()
  const pref = data?.langue
  if (!isLocale(pref)) return false
  await setLocale(pref)
  return pref !== 'fr'
}
