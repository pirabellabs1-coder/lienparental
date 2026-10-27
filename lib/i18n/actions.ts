'use server'
import { cookies } from 'next/headers'
import { isLocale, LOCALE_COOKIE } from './config'

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
