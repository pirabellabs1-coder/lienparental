/**
 * Metadata Next.js d'une page publique (module pur) : titre, description, canonical absolu,
 * Open Graph (siteName, url, locale, image 1200×630) et carte Twitter `summary_large_image`.
 * La langue étant portée par un cookie (même URL pour FR/EN/PT), le canonical est l'URL unique.
 */
import type { Metadata } from 'next'
import { INTL_LOCALE, isLocale } from '@/lib/i18n/config'
import { OG_IMAGE_PATH, SITE_NAME, abs } from './site'

/** Locale Open Graph : fr → fr_FR, en → en_US, pt → pt_BR (repli fr_FR). */
export const ogLocale = (locale?: string | null) => (isLocale(locale) ? INTL_LOCALE[locale] : INTL_LOCALE.fr).replace('-', '_')

export type OgImage = { url: string; alt?: string; width?: number; height?: number }

export const defaultOgImage = (alt: string = SITE_NAME): OgImage => ({ url: abs(OG_IMAGE_PATH), width: 1200, height: 630, alt })

export type PageMetaInput = {
  title: string
  description: string
  /** Chemin canonique, avec sa chaîne de requête éventuelle (ex. `/blog?page=2`). */
  path: string
  locale: string
  /** Titre utilisé tel quel (sans le suffixe « · Lien Parental » du gabarit). */
  absoluteTitle?: boolean
  images?: OgImage[]
  ogImageAlt?: string
  robots?: Metadata['robots']
  article?: { publishedTime?: string; modifiedTime?: string; section?: string; tags?: string[]; authors?: string[] }
  keywords?: string[]
}

export function pageMetadata(i: PageMetaInput): Metadata {
  const url = abs(i.path)
  const fullTitle = i.absoluteTitle ? i.title : `${i.title} · ${SITE_NAME}`
  const images = i.images?.length ? i.images : [defaultOgImage(i.ogImageAlt)]
  const common = { siteName: SITE_NAME, url, title: fullTitle, description: i.description, locale: ogLocale(i.locale), images }
  return {
    title: i.absoluteTitle ? { absolute: i.title } : i.title,
    description: i.description,
    ...(i.keywords?.length ? { keywords: i.keywords } : {}),
    alternates: { canonical: url },
    openGraph: i.article ? { ...common, type: 'article', ...i.article } : { ...common, type: 'website' },
    twitter: { card: 'summary_large_image', title: fullTitle, description: i.description, images: images.map((im) => im.url) },
    ...(i.robots ? { robots: i.robots } : {}),
  }
}

/** Pages hors index (étapes d'onboarding, mot de passe, console, admin) : liens suivis, page non indexée. */
export const NOINDEX_FOLLOW: Metadata['robots'] = { index: false, follow: true }
export const NOINDEX_NOFOLLOW: Metadata['robots'] = { index: false, follow: false }
