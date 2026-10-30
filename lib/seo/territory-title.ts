/**
 * Complément de lieu du titre d'une fiche ou d'un parcours du Guide (« en Guyane », « in French Guiana »),
 * dans la langue du CONTENU, pas de l'interface (module pur, testé par tests/seo-titles.test.ts).
 *
 * Catalogues importés directement : `getTranslations({ locale })` renverrait la langue de la requête
 * (i18n/request.ts ignore la locale demandée), et une fiche affichée en français sous /en aurait
 * « Médiation familiale in French Guiana ».
 */
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr/public.json'
import en from '@/messages/en/public.json'
import pt from '@/messages/pt/public.json'
import { catalogTerritoryName } from '@/lib/guide/territory-name'

const CATALOG = { fr, en, pt } as const
type CatalogLocale = keyof typeof CATALOG
const isCatalogLocale = (v: string): v is CatalogLocale => Object.prototype.hasOwnProperty.call(CATALOG, v)

export function titleTerritory(code: string, lang: string): { where: string; name: string } {
  const locale: CatalogLocale = isCatalogLocale(lang) ? lang : 'fr'
  const t = createTranslator({ locale, messages: CATALOG[locale], namespace: 'public.guide' })
  const name = catalogTerritoryName(code, locale) ?? code
  return { where: t('inTerritory', { code, territory: name }), name }
}
