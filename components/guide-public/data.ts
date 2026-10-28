import 'server-only'
import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { loadGuide, type GuideSnapshot } from '@/lib/guide/load'
import { intlLocale, locales, type Locale } from '@/lib/i18n/config'
import { localeAlternates, metadataAlternates, ogLocale } from '@/lib/seo/metadata'

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

/** Coupe un texte au dernier mot entier avant `max` caractères (points de suspension inclus). */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`
}

const SUFFIX = ' · Lien Parental'
const TITLE_MAX = 60

/**
 * Titre ≤ 60 caractères, gabarit du site compris (« %s · Lien Parental », app/layout.tsx).
 * Trop long avec le suffixe : titre absolu, sans suffixe, tronqué proprement.
 */
export function pageTitle(title: string): Metadata['title'] {
  if (title.length + SUFFIX.length <= TITLE_MAX) return title
  return { absolute: truncate(title, TITLE_MAX) }
}

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
}): Metadata {
  const description = truncate(o.description, 155)
  const alt = localeAlternates(o.path, { locale: o.locale, contentLocale: o.lang, available: o.available })
  const url = alt.canonical
  return {
    title: pageTitle(o.title),
    description,
    alternates: metadataAlternates(alt),
    keywords: o.tags,
    openGraph: {
      type: o.type ?? 'website',
      title: o.title,
      description,
      url,
      siteName: 'Lien Parental',
      locale: ogLocale(alt.shown),
      ...(alt.others.length ? { alternateLocale: alt.others.map(ogLocale) } : {}),
      ...(o.type === 'article' ? { modifiedTime: o.modifiedTime, section: o.section, tags: o.tags } : {}),
    },
    twitter: { card: 'summary', title: o.title, description },
  }
}
