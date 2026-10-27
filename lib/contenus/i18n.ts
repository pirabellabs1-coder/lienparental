/**
 * Lecture localisée du contenu éditorial (FAQ, tutoriels, blog, Guide, modèles, conseils).
 *
 * Module PUR (ni React, ni serveur, ni fichiers) : partagé par les lectures publiques, le dépôt
 * admin, les lecteurs des fichiers du dépôt (lib/contenus/i18n-files.ts) et l'éditeur admin.
 *
 * Règle (docs/I18N-CONTENU.md) : une traduction est un objet de même forme que le français.
 * On superpose ses TEXTES sur la structure française ; les champs invariants
 * (lib/contenus/i18n-invariants.ts : slugs, URL, catégories, dates…) viennent TOUJOURS du
 * français, à n'importe quelle profondeur. Puis on revalide avec le schéma zod du type.
 * Traduction absente, de structure différente (tableau de longueur différente, type inattendu)
 * ou invalide : on affiche le français, jamais un mélange incohérent ni une erreur.
 */
import { isPlainObject, overlayTranslation } from './i18n-overlay'
import type { ContentLocale, Translations } from './locale'
import { CONTENT_SCHEMAS, zodIssues, type ContentData, type ContentKind } from './types'

export * from './locale'
export * from './i18n-overlay'

export type TranslationCheck<K extends ContentKind> =
  | { ok: true; data: ContentData[K] }
  | { ok: false; reason: 'missing' | 'structure' | 'schema'; issues: { path: string; message: string }[] }

/** Applique et valide une traduction (sans repli) : utilisé par la lecture et par l'enregistrement admin. */
export function checkTranslation<K extends ContentKind>(kind: K, fr: ContentData[K], translation: unknown): TranslationCheck<K> {
  if (!isPlainObject(translation)) return { ok: false, reason: 'missing', issues: [] }
  const o = overlayTranslation(fr, translation)
  if (o.mismatch) {
    return {
      ok: false, reason: 'structure',
      issues: [{ path: '', message: 'La traduction n’a pas la même structure que le français (nombre d’éléments différent) : reprenez-la depuis le français.' }],
    }
  }
  const parsed = CONTENT_SCHEMAS[kind].safeParse(o.value)
  if (!parsed.success) return { ok: false, reason: 'schema', issues: zodIssues(parsed.error) }
  return { ok: true, data: parsed.data as ContentData[K] }
}

/**
 * Données affichées : la traduction superposée au français si elle est présente et valide,
 * sinon le français tel quel.
 */
export function localizeData<K extends ContentKind>(kind: K, frData: ContentData[K], translation: unknown): ContentData[K] {
  const r = checkTranslation(kind, frData, translation)
  return r.ok ? r.data : frData
}

/** Comme localizeData, avec la langue réellement affichée (pour l'attribut `lang`). */
export function localizeWithLang<K extends ContentKind>(
  kind: K, frData: ContentData[K], translations: Translations | undefined, locale: ContentLocale,
): { data: ContentData[K]; lang: ContentLocale } {
  if (locale === 'fr') return { data: frData, lang: 'fr' }
  const r = checkTranslation(kind, frData, translations?.[locale])
  return r.ok ? { data: r.data, lang: locale } : { data: frData, lang: 'fr' }
}

export type TranslationStatus = 'traduit' | 'manquant' | 'a-revoir'

/** État d'une traduction pour les listes admin (« à revoir » = présente mais affichée en français). */
export function translationStatus<K extends ContentKind>(kind: K, frData: ContentData[K], translation: unknown): TranslationStatus {
  if (!isPlainObject(translation)) return 'manquant'
  return checkTranslation(kind, frData, translation).ok ? 'traduit' : 'a-revoir'
}

/** Point de départ de l'éditeur de traduction : la traduction existante (au mieux), sinon le français à traduire. */
export function prefillTranslation<T>(frData: T, translation: unknown): T {
  return overlayTranslation(frData, isPlainObject(translation) ? translation : undefined).value as T
}

