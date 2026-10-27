/**
 * Traducteur « hors composant » pour les bibliothèques (lib/*) qui produisent du texte affiché
 * mais ne peuvent pas utiliser de hook React (fonctions utilitaires, messages de validation,
 * erreurs côté navigateur…).
 *
 * - Côté navigateur : la langue vient de <html lang> (posé par le layout racine d'après le cookie).
 * - Côté serveur (pas de document) : repli sur le français. Dans du code serveur ASYNCHRONE
 *   exécuté pendant une requête, préférer `await getTranslations('…')` (next-intl/server),
 *   qui suit le cookie de l'utilisateur.
 *
 * Seuls les catalogues `auth` et `shared` sont embarqués ici (petits) pour ne pas alourdir
 * le bundle client avec toute l'application.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { defaultLocale, isLocale, type Locale } from './config'
import frAuth from '@/messages/fr/auth.json'
import enAuth from '@/messages/en/auth.json'
import ptAuth from '@/messages/pt/auth.json'
import frShared from '@/messages/fr/shared.json'
import enShared from '@/messages/en/shared.json'
import ptShared from '@/messages/pt/shared.json'

const CATALOGS: Record<Locale, AbstractIntlMessages> = {
  fr: { ...frAuth, ...frShared } as AbstractIntlMessages,
  en: { ...enAuth, ...enShared } as AbstractIntlMessages,
  pt: { ...ptAuth, ...ptShared } as AbstractIntlMessages,
}

/** Langue courante côté navigateur (d'après <html lang>), français côté serveur. */
export function clientLocale(): Locale {
  if (typeof document === 'undefined') return defaultLocale
  const l = document.documentElement.lang.slice(0, 2).toLowerCase()
  return isLocale(l) ? l : defaultLocale
}

/**
 * Traducteur synchrone pour les namespaces `auth.*` et `shared.*`.
 * Exemple : `libT('shared.vault')('errors.tooBig', { max: 10 })`.
 */
export function libT(namespace?: string, locale: Locale = clientLocale()) {
  return createTranslator({ locale, messages: CATALOGS[locale], namespace: namespace as never })
}
