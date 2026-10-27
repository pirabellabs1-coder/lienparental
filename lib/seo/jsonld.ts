/**
 * Constructeurs de données structurées schema.org (module pur), à passer à components/seo/JsonLd.tsx.
 * Règles (docs/SEO-AUDIT.md) : jamais d'aggregateRating (aucun avis réel), pas de SearchAction,
 * `sameAs` vide tant qu'il n'existe pas de profils officiels, prix générés depuis
 * components/profil/pricing.ts (jamais en dur). Les libellés arrivent déjà traduits.
 */
import { PLAN_NAME, PRICING, type Cycle, type PaidPlan } from '@/components/profil/pricing'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { INTL_LOCALE, isLocale, locales } from '@/lib/i18n/config'
import { APP_ID, CONTACT_EMAIL, LOGO_PATH, ORG_ID, PUBLISHER_NAME, SITE, SITE_NAME, WEBSITE_ID, abs } from './site'

type Node = Record<string, unknown>

/** Code BCP 47 d'une langue de contenu (fr → fr-FR, en → en-US, pt → pt-BR ; repli fr-FR). */
export const inLanguage = (lang?: string | null) => (isLocale(lang) ? INTL_LOCALE[lang] : INTL_LOCALE.fr)

const ALL_LANGUAGES = locales.map((l) => INTL_LOCALE[l])

export const graph = (...nodes: Node[]): Node => ({ '@context': 'https://schema.org', '@graph': nodes })

/** L'éditeur du service. `email` = contact publié dans les mentions légales. */
export function organization(i: { description: string }): Node {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: SITE,
    logo: { '@type': 'ImageObject', url: abs(LOGO_PATH), width: 512, height: 512 },
    description: i.description,
    email: CONTACT_EMAIL,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: SUPPORT_EMAIL, availableLanguage: ['French', 'English', 'Portuguese'] }],
    areaServed: { '@type': 'AdministrativeArea', name: 'Guyane' },
    parentOrganization: { '@type': 'Organization', name: PUBLISHER_NAME },
    sameAs: [],
  }
}

/** Le site (sans SearchAction : pas de moteur de recherche public). */
export function website(i: { description: string; locale: string }): Node {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE,
    name: SITE_NAME,
    description: i.description,
    inLanguage: inLanguage(i.locale),
    publisher: { '@id': ORG_ID },
  }
}

/** `free` : nom traduit de la formule gratuite ; `monthly` / `yearly` : cycle de facturation. */
export type OfferLabels = { free: string; monthly: string; yearly: string }

const price = (n: number) => n.toFixed(2)

function paidOffer(plan: PaidPlan, cycle: Cycle, labels: OfferLabels): Node {
  const p = PRICING[plan]
  const amount = cycle === 'annuel' ? p.yearly : p.monthly
  return {
    '@type': 'Offer',
    name: `${PLAN_NAME[plan]} (${cycle === 'annuel' ? labels.yearly : labels.monthly})`,
    price: price(amount),
    priceCurrency: PRICING.currency,
    category: 'subscription',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: price(amount),
      priceCurrency: PRICING.currency,
      billingDuration: cycle === 'annuel' ? 'P1Y' : 'P1M',
    },
  }
}

/** Offres réelles : Gratuit, puis Premium et Coparentalité+ en mensuel et annuel (prix de pricing.ts). */
export function offers(labels: OfferLabels): Node[] {
  return [
    { '@type': 'Offer', name: labels.free, price: price(0), priceCurrency: PRICING.currency },
    ...(['premium', 'coparentalite'] as const).flatMap((plan) => (['mensuel', 'annuel'] as const).map((cycle) => paidOffer(plan, cycle, labels))),
  ]
}

/** L'application web (PWA). */
export function webApplication(i: { description: string; offerLabels: OfferLabels; featureList?: string[] }): Node {
  return {
    '@type': 'WebApplication',
    '@id': APP_ID,
    name: SITE_NAME,
    url: SITE,
    description: i.description,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web, iOS, Android',
    browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
    inLanguage: ALL_LANGUAGES,
    isAccessibleForFree: true,
    ...(i.featureList?.length ? { featureList: i.featureList } : {}),
    publisher: { '@id': ORG_ID },
    offers: offers(i.offerLabels),
  }
}

export type FaqEntry = { question: string; answer: string }

/** Page de questions fréquentes (texte visible sur la page, sans balisage). */
export function faqPage(i: { path: string; locale: string; items: FaqEntry[] }): Node {
  const url = abs(i.path)
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    url,
    inLanguage: inLanguage(i.locale),
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: i.items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  }
}

export type Crumb = { name: string; path: string }

export function breadcrumbList(i: { path: string; crumbs: Crumb[] }): Node {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${abs(i.path)}#breadcrumb`,
    itemListElement: i.crumbs.map((c, n) => ({ '@type': 'ListItem', position: n + 1, name: c.name, item: abs(c.path) })),
  }
}

export type BlogPostingInput = {
  path: string
  headline: string
  description?: string
  image?: string
  datePublished: string
  dateModified?: string
  section?: string
  keywords?: string[]
  /** Langue réellement affichée (traduction ou repli français). */
  lang?: string
  wordCount?: number
}

/** Article du blog : auteur et éditeur = l'organisation (« L'équipe Lien Parental », pas une personne). */
export function blogPosting(i: BlogPostingInput): Node {
  const url = abs(i.path)
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    url,
    headline: i.headline.slice(0, 110),
    ...(i.description ? { description: i.description } : {}),
    ...(i.image ? { image: [i.image] } : {}),
    datePublished: i.datePublished,
    dateModified: i.dateModified || i.datePublished,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@id': `${SITE}/blog#blog` },
    ...(i.section ? { articleSection: i.section } : {}),
    ...(i.keywords?.length ? { keywords: i.keywords.join(', ') } : {}),
    inLanguage: inLanguage(i.lang),
    ...(i.wordCount ? { wordCount: i.wordCount } : {}),
  }
}

export function blog(i: { name: string; description: string; locale: string }): Node {
  return {
    '@type': 'Blog',
    '@id': `${SITE}/blog#blog`,
    url: `${SITE}/blog`,
    name: i.name,
    description: i.description,
    inLanguage: inLanguage(i.locale),
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': WEBSITE_ID },
  }
}

/** Page « À propos ». */
export function aboutPage(i: { path: string; name: string; description: string; locale: string }): Node {
  const url = abs(i.path)
  return {
    '@type': 'AboutPage',
    '@id': `${url}#webpage`,
    url,
    name: i.name,
    description: i.description,
    inLanguage: inLanguage(i.locale),
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
    mainEntity: { '@id': ORG_ID },
  }
}
