// Configuration i18n (Phase 1) — locale portée par un cookie, sans préfixe d'URL.
// Ce choix évite de restructurer les 100+ routes sous app/[locale] et de toucher à la
// middleware personnalisée (porte admin, auth, CSRF). Le routing par URL (/en, /pt)
// pourra s'ajouter plus tard sans remettre en cause les catalogues de messages.

export const locales = ['fr', 'en', 'pt'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'fr'

/** Cookie qui mémorise la langue choisie (lisible côté serveur dans getRequestConfig). */
export const LOCALE_COOKIE = 'lp_locale'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}

export type FlagKey = 'fr' | 'gb' | 'br'

/** Métadonnées d'affichage de chaque langue (libellé, nom natif, attribut lang, drapeau). */
export const LOCALE_META: Record<Locale, { code: string; native: string; htmlLang: string; flag: FlagKey }> = {
  fr: { code: 'FR', native: 'Français', htmlLang: 'fr', flag: 'fr' },
  en: { code: 'EN', native: 'English', htmlLang: 'en', flag: 'gb' },
  pt: { code: 'PT', native: 'Português', htmlLang: 'pt-BR', flag: 'br' },
}
