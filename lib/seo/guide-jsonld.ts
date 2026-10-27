/**
 * Données structurées schema.org du Guide parental public (/guide/**). Module pur : il reçoit des
 * données déjà chargées et des libellés déjà traduits, et renvoie des graphes JSON-LD à passer à
 * components/seo/JsonLd.tsx.
 *
 * Choix (docs/SEO-AUDIT.md, item 12) : fiche = WebPage + Article + BreadcrumbList, avec les sources
 * officielles en `citation` ; index et catégorie = CollectionPage + ItemList ; parcours = ItemList ordonnée.
 * Jamais de HowTo, GovernmentService ni aggregateRating. Le champ `aConfirmer` n'est jamais lu ici.
 */
import { INTL_LOCALE, isLocale } from '@/lib/i18n/config'
import { ORG_ID, WEBSITE_ID, abs } from './site'

export type Crumb = { name: string; path: string }
export type ListEntry = { name: string; path?: string }

type Graph = Record<string, unknown>

/** Code BCP 47 de la langue réellement affichée (fr → fr-FR, en → en-US, pt → pt-BR). */
export function bcp47(lang: string | undefined): string {
  return isLocale(lang) ? INTL_LOCALE[lang] : INTL_LOCALE.fr
}

const pageId = (url: string) => `${url}#webpage`
const crumbsId = (url: string) => `${url}#breadcrumb`

export function breadcrumbList(crumbs: Crumb[], url: string): Graph {
  return {
    '@type': 'BreadcrumbList',
    '@id': crumbsId(url),
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
  }
}

function itemList(entries: ListEntry[], ordered: boolean): Graph {
  return {
    '@type': 'ItemList',
    ...(ordered ? { itemListOrder: 'https://schema.org/ItemListOrderAscending' } : {}),
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.name,
      ...(e.path ? { url: abs(e.path) } : {}),
    })),
  }
}

export type FicheJsonLdInput = {
  path: string
  title: string
  description: string
  /** Langue réellement affichée (traduction ou repli français). */
  lang: string
  derniereVerification: string
  motsCles: string[]
  section: string
  territoireNom: string
  audience: string
  sources: { titre: string; url: string; verifieLe?: string }[]
  crumbs: Crumb[]
}

/** Fiche : WebPage (lastReviewed, reviewedBy) + Article (citation des sources) + BreadcrumbList. */
export function ficheJsonLd(i: FicheJsonLdInput): Graph {
  const url = abs(i.path)
  const inLanguage = bcp47(i.lang)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageId(url),
        url,
        name: i.title,
        description: i.description,
        inLanguage,
        isPartOf: { '@id': WEBSITE_ID },
        breadcrumb: { '@id': crumbsId(url) },
        mainEntity: { '@id': `${url}#article` },
        lastReviewed: i.derniereVerification,
        reviewedBy: { '@id': ORG_ID },
      },
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: i.title.slice(0, 110),
        description: i.description,
        dateModified: i.derniereVerification,
        author: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
        mainEntityOfPage: { '@id': pageId(url) },
        articleSection: i.section,
        ...(i.motsCles.length ? { keywords: i.motsCles.join(', ') } : {}),
        inLanguage,
        isAccessibleForFree: true,
        spatialCoverage: { '@type': 'AdministrativeArea', name: i.territoireNom },
        audience: { '@type': 'PeopleAudience', audienceType: i.audience },
        citation: i.sources.map((s) => ({
          '@type': 'CreativeWork',
          name: s.titre,
          url: s.url,
          ...(s.verifieLe ? { dateModified: s.verifieLe } : {}),
        })),
      },
      breadcrumbList(i.crumbs, url),
    ],
  }
}

export type CollectionJsonLdInput = {
  path: string
  title: string
  description: string
  lang: string
  entries: ListEntry[]
  crumbs: Crumb[]
}

/** Index du Guide, d'un territoire ou d'une catégorie : CollectionPage + ItemList + BreadcrumbList. */
export function collectionJsonLd(i: CollectionJsonLdInput): Graph {
  const url = abs(i.path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': pageId(url),
        url,
        name: i.title,
        description: i.description,
        inLanguage: bcp47(i.lang),
        isPartOf: { '@id': WEBSITE_ID },
        publisher: { '@id': ORG_ID },
        breadcrumb: { '@id': crumbsId(url) },
        mainEntity: itemList(i.entries, false),
      },
      breadcrumbList(i.crumbs, url),
    ],
  }
}

/** Parcours : WebPage + ItemList ordonnée des étapes (liées à leur fiche quand elle existe) + BreadcrumbList. */
export function parcoursJsonLd(i: CollectionJsonLdInput): Graph {
  const url = abs(i.path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageId(url),
        url,
        name: i.title,
        description: i.description,
        inLanguage: bcp47(i.lang),
        isPartOf: { '@id': WEBSITE_ID },
        publisher: { '@id': ORG_ID },
        breadcrumb: { '@id': crumbsId(url) },
        mainEntity: { ...itemList(i.entries, true), name: i.title },
      },
      breadcrumbList(i.crumbs, url),
    ],
  }
}
