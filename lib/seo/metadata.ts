/**
 * Metadata Next.js d'une page publique (module pur) : titre, description, canonical absolu,
 * hreflang (fr / en / pt-BR / x-default), Open Graph (siteName, url, locale + alternates, image
 * 1200×630) et carte Twitter `summary_large_image`.
 *
 * Une URL par langue (lib/i18n/routing.ts) : `/aide` (fr), `/en/aide`, `/pt/aide`. Un contenu sans
 * traduction dans la langue de l'URL (affiché en français en repli) a son canonical sur l'URL
 * française et n'émet aucun hreflang ; les autres versions ne le citent pas non plus.
 */
import type { Metadata } from 'next'
import { INTL_LOCALE, isLocale, locales, type Locale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/routing'
import { OG_IMAGE_PATH, SITE_NAME, abs } from './site'

/** Locale Open Graph : fr → fr_FR, en → en_US, pt → pt_BR (repli fr_FR). */
export const ogLocale = (locale?: string | null) => (isLocale(locale) ? INTL_LOCALE[locale] : INTL_LOCALE.fr).replace('-', '_')

/** Code hreflang de chaque langue (le portugais servi est celui du Brésil). */
export const HREFLANG: Record<Locale, string> = { fr: 'fr', en: 'en', pt: 'pt-BR' }

const asLocale = (v: string | null | undefined): Locale => (isLocale(v) ? v : 'fr')

export type LocaleAlternates = {
  /** URL absolue canonique. */
  canonical: string
  /** hreflang → URL absolue (dont `x-default` = français) ; absent si la page n'est pas sa propre canonique. */
  languages?: Record<string, string>
  /** Langue réellement affichée. */
  shown: Locale
  /** Langues traduites (pour og:locale:alternate), vide si la page n'est pas sa propre canonique. */
  others: Locale[]
}

/**
 * Canonical + hreflang d'un chemin public (avec sa requête éventuelle, ex. `/blog?page=2`).
 * - `locale` : langue de l'URL demandée ;
 * - `contentLocale` : langue réellement affichée (repli français d'un contenu non traduit) ;
 * - `available` : langues dans lesquelles le contenu existe vraiment (défaut : toutes ; fr toujours).
 */
export function localeAlternates(path: string, i: { locale: string; contentLocale?: string | null; available?: readonly Locale[] }): LocaleAlternates {
  const urlLocale = asLocale(i.locale)
  const shown = i.contentLocale ? asLocale(i.contentLocale) : urlLocale
  const available = locales.filter((l) => l === 'fr' || (i.available ?? locales).includes(l))
  // Repli (contenu non traduit) : la version /en|pt pointe vers l'URL de la langue affichée (le français).
  if (shown !== urlLocale || !available.includes(urlLocale)) {
    return { canonical: abs(localePath(shown, path)), shown, others: [] }
  }
  const canonical = abs(localePath(urlLocale, path))
  if (available.length < 2) return { canonical, shown, others: [] }
  const languages: Record<string, string> = {}
  for (const l of available) languages[HREFLANG[l]] = abs(localePath(l, path))
  languages['x-default'] = abs(localePath('fr', path))
  return { canonical, languages, shown, others: available.filter((l) => l !== shown) }
}

/** `alternates` Next.js (canonical + languages) à partir de localeAlternates(). */
export const metadataAlternates = (a: LocaleAlternates): Metadata['alternates'] =>
  a.languages ? { canonical: a.canonical, languages: a.languages } : { canonical: a.canonical }

export type OgImage = { url: string; alt?: string; width?: number; height?: number }

export const defaultOgImage = (alt: string = SITE_NAME): OgImage => ({ url: abs(OG_IMAGE_PATH), width: 1200, height: 630, alt })

export type PageMetaInput = {
  title: string
  description: string
  /** Chemin canonique SANS préfixe de langue, avec sa chaîne de requête éventuelle (ex. `/blog?page=2`). */
  path: string
  /** Langue de l'URL demandée (`await getLocale()`). */
  locale: string
  /** Langue réellement affichée si elle diffère (contenu non traduit affiché en français). */
  contentLocale?: string | null
  /** Langues dans lesquelles ce contenu est réellement traduit (défaut : toutes). */
  available?: readonly Locale[]
  /** Titre utilisé tel quel (sans le suffixe « · Lien Parental » du gabarit). */
  absoluteTitle?: boolean
  images?: OgImage[]
  ogImageAlt?: string
  robots?: Metadata['robots']
  article?: { publishedTime?: string; modifiedTime?: string; section?: string; tags?: string[]; authors?: string[] }
  keywords?: string[]
}

export function pageMetadata(i: PageMetaInput): Metadata {
  const alt = localeAlternates(i.path, i)
  const url = alt.canonical
  const fullTitle = i.absoluteTitle ? i.title : `${i.title} · ${SITE_NAME}`
  const images = i.images?.length ? i.images : [defaultOgImage(i.ogImageAlt)]
  const common = {
    siteName: SITE_NAME,
    url,
    title: fullTitle,
    description: i.description,
    locale: ogLocale(alt.shown),
    ...(alt.others.length ? { alternateLocale: alt.others.map(ogLocale) } : {}),
    images,
  }
  return {
    title: i.absoluteTitle ? { absolute: i.title } : i.title,
    description: i.description,
    ...(i.keywords?.length ? { keywords: i.keywords } : {}),
    alternates: metadataAlternates(alt),
    openGraph: i.article ? { ...common, type: 'article', ...i.article } : { ...common, type: 'website' },
    twitter: { card: 'summary_large_image', title: fullTitle, description: i.description, images: images.map((im) => im.url) },
    ...(i.robots ? { robots: i.robots } : {}),
  }
}

/** Pages hors index (étapes d'onboarding, mot de passe, console, admin) : liens suivis, page non indexée. */
export const NOINDEX_FOLLOW: Metadata['robots'] = { index: false, follow: true }
export const NOINDEX_NOFOLLOW: Metadata['robots'] = { index: false, follow: false }
