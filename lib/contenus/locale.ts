/**
 * Langues du contenu éditorial : constantes et aides MINIMALES (aucune dépendance).
 * Importable partout, y compris dans les composants clients de l'espace parent, sans embarquer
 * les schémas zod des contenus (lib/contenus/i18n.ts, qui ré-exporte ce module).
 */
export const CONTENT_LOCALES = ['fr', 'en', 'pt'] as const
export type ContentLocale = (typeof CONTENT_LOCALES)[number]

/** Langues de traduction (le français est l'original, jamais stocké dans `translations`). */
export const TRANSLATION_LOCALES = ['en', 'pt'] as const
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number]

export const TRANSLATION_LOCALE_LABEL: Record<TranslationLocale, string> = { en: 'Anglais', pt: 'Portugais' }

/** Élément affiché : `lang` = langue réellement affichée (présent seulement hors français). */
export type Localized<T> = T & { lang?: ContentLocale }

/** Colonne `translations` : { en?: <objet complet>, pt?: <objet complet> }. */
export type Translations = Partial<Record<TranslationLocale, unknown>>

export function isContentLocale(v: unknown): v is ContentLocale {
  return typeof v === 'string' && (CONTENT_LOCALES as readonly string[]).includes(v)
}

export function isTranslationLocale(v: unknown): v is TranslationLocale {
  return typeof v === 'string' && (TRANSLATION_LOCALES as readonly string[]).includes(v)
}

/** Locale de contenu validée (toute valeur inconnue → français). */
export function toContentLocale(v: unknown): ContentLocale {
  return isContentLocale(v) ? v : 'fr'
}

/**
 * Valeur de l'attribut `lang` d'un contenu : seulement s'il diffère de la langue de l'interface
 * (ex. fiche non traduite, affichée en français dans une interface anglaise → "fr").
 */
export function contentLangAttr(contentLang: ContentLocale | undefined, uiLocale: string): string | undefined {
  if (!contentLang || contentLang === uiLocale) return undefined
  return contentLang === 'pt' ? 'pt-BR' : contentLang
}
