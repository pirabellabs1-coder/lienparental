/**
 * Nom affiché d'un territoire dans la langue de l'interface (module pur, sans React).
 *
 * Règle : en français, le nom du contenu. Ailleurs : la traduction du contenu
 * (content/i18n/<l>/guide/<code>/territoire.json) si elle diffère vraiment du français,
 * sinon le nom du catalogue `shared.territories.<code>` (« French Guiana », « Guiana Francesa »),
 * sinon le nom du contenu (territoire inconnu du catalogue).
 */
import fr from '@/messages/fr/shared.json'
import en from '@/messages/en/shared.json'
import pt from '@/messages/pt/shared.json'

const CATALOG: Record<string, Record<string, string>> = {
  fr: fr.shared.territories,
  en: en.shared.territories,
  pt: pt.shared.territories,
}

/** Nom du catalogue pour `code` dans `locale` (français par défaut), ou `undefined`. */
export function catalogTerritoryName(code: string, locale: string): string | undefined {
  const names = CATALOG[locale] ?? CATALOG.fr
  return Object.prototype.hasOwnProperty.call(names, code) ? names[code] : undefined
}

/**
 * @param code      code du territoire (« guyane »)
 * @param frName    nom français du contenu
 * @param localized nom après superposition de la traduction du contenu (identique au français s'il n'y en a pas)
 */
export function territoryDisplayName(code: string, frName: string, localized: string, locale: string): string {
  if (locale === 'fr') return frName
  if (localized && localized !== frName) return localized
  return catalogTerritoryName(code, locale) ?? localized ?? frName
}
