// Configuration i18n — locale portée par un cookie dans l'espace connecté ; les pages publiques
// ont en plus une URL par langue (/en/…, /pt/…) réécrite par la middleware, sans déplacer les
// routes sous app/[locale] (voir lib/i18n/routing.ts).

export const locales = ['fr', 'en', 'pt'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'fr'

/** Cookie qui mémorise la langue choisie (lisible côté serveur dans getRequestConfig). */
export const LOCALE_COOKIE = 'lp_locale'

/**
 * Marqueur posé par la middleware à côté de lp_locale quand celui-ci a été mémorisé
 * AUTOMATIQUEMENT (premier passage sur /en|pt/…) : la langue suit alors l'inscription et l'app,
 * mais ne redirige pas les URL françaises. Supprimé par tout choix explicite (setLocale).
 */
export const LOCALE_AUTO_COOKIE = 'lp_locale_auto'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}

export type FlagKey = 'fr' | 'gb' | 'br'

/** Locale BCP 47 pour Intl (dates, nombres, devises) : fr → fr-FR, en → en-US, pt → pt-BR. */
export const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US', pt: 'pt-BR' }

/** Locale Intl à partir de la locale next-intl (repli fr-FR). Utiliser avec useLocale() / getLocale(). */
export function intlLocale(locale: string | undefined | null): string {
  return isLocale(locale) ? INTL_LOCALE[locale] : INTL_LOCALE.fr
}

/** Métadonnées d'affichage de chaque langue (libellé, nom natif, attribut lang, drapeau). */
export const LOCALE_META: Record<Locale, { code: string; native: string; htmlLang: string; flag: FlagKey }> = {
  fr: { code: 'FR', native: 'Français', htmlLang: 'fr', flag: 'fr' },
  en: { code: 'EN', native: 'English', htmlLang: 'en', flag: 'gb' },
  pt: { code: 'PT', native: 'Português', htmlLang: 'pt-BR', flag: 'br' },
}
