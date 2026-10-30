import 'server-only'
import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { loadGuide, type GuideSnapshot } from '@/lib/guide/load'
import { intlLocale, locales, type Locale } from '@/lib/i18n/config'
import { defaultOgImage, localeAlternates, metadataAlternates, ogLocale } from '@/lib/seo/metadata'
import { SITE_NAME } from '@/lib/seo/site'
import { localTitle, pageTitle, truncate } from '@/lib/seo/titles'

/**
 * Accès aux données du Guide public (/guide/**) avec validation stricte des paramètres d'URL :
 * `loadGuide()` retombe sur le territoire par défaut quand le code est inconnu, ce qui ferait
 * répondre /guide/nimporte-quoi avec la Guyane. Ici, un code inconnu ou indisponible renvoie null
 * (la page appelle alors notFound()).
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 80 && SLUG_RE.test(v)
}

export async function loadPublicTerritory(code: string): Promise<{ g: GuideSnapshot; locale: string } | null> {
  if (!isSlug(code)) return null
  const locale = await getLocale()
  const g = await loadGuide(code, locale)
  if (g.territoire.code !== code || !g.territoire.disponible) return null
  return { g, locale }
}

/**
 * Langues dans lesquelles une fiche ou un parcours existe VRAIMENT (le français toujours) : sert aux
 * hreflang et au sitemap. Une version EN/PT affichée en repli français n'y figure pas.
 */
export async function guideItemLocales(code: string, kind: 'fiche' | 'parcours', slug: string): Promise<Locale[]> {
  const found = await Promise.all(locales.map(async (l) => {
    if (l === 'fr') return l
    const g = await loadGuide(code, l)
    const item = kind === 'fiche' ? g.fiches.find((f) => f.slug === slug) : g.parcours.find((p) => p.slug === slug)
    return item?.lang === l ? l : null
  }))
  return found.filter((l): l is Locale => l !== null)
}

export const formatDate =(iso: string, locale: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`))

// Réexportés pour les pages du Guide (fonctions pures dans lib/seo/titles.ts).
export { localTitle, pageTitle, truncate }
export { titleTerritory } from '@/lib/seo/territory-title'

const titleText = (t: Metadata['title']): string =>
  typeof t === 'string' ? t : t && 'absolute' in t ? t.absolute : ''

/**
 * Métadonnées communes des pages du Guide public : canonical absolu de la langue courante, hreflang
 * (fr / en / pt-BR / x-default), Open Graph (locale + alternates), Twitter.
 * - `path` : chemin SANS préfixe de langue ; `locale` : langue de l'URL (`await getLocale()`) ;
 * - `lang` : langue réellement affichée (fiche non traduite → 'fr' : canonical vers l'URL française) ;
 * - `available` : langues dans lesquelles la fiche / le parcours est réellement traduit (défaut : toutes).
 */
export function guideMetadata(o: {
  title: string
  description: string
  path: string
  locale: string
  lang?: string
  available?: readonly Locale[]
  type?: 'website' | 'article'
  modifiedTime?: string
  section?: string
  tags?: string[]
  /** Fiche ou parcours : territoire ajouté au titre (voir localTitle). */
  territory?: { where: string; name: string }
}): Metadata {
  const description = truncate(o.description, 155)
  const alt = localeAlternates(o.path, { locale: o.locale, contentLocale: o.lang, available: o.available })
  const url = alt.canonical
  const title = o.territory ? localTitle(o.title, o.territory.where, o.territory.name) : pageTitle(o.title)
  const socialTitle = titleText(title) || o.title
  // Les metadata d'une page remplacent l'openGraph du layout racine : l'image par défaut doit être reprise ici.
  const images = [defaultOgImage()]
  return {
    title,
    description,
    alternates: metadataAlternates(alt),
    keywords: o.tags,
    openGraph: {
      type: o.type ?? 'website',
      title: socialTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: ogLocale(alt.shown),
      ...(alt.others.length ? { alternateLocale: alt.others.map(ogLocale) } : {}),
      images,
      ...(o.type === 'article' ? { modifiedTime: o.modifiedTime, section: o.section, tags: o.tags } : {}),
    },
    twitter: { card: 'summary_large_image', title: socialTitle, description, images: images.map((im) => im.url) },
  }
}
