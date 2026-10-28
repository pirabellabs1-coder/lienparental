/**
 * Entrées de sitemap multilingues (module pur) : une entrée par URL ET par langue réellement
 * traduite, chacune avec `alternates.languages` (hreflang fr / en / pt-BR / x-default).
 * Une langue absente de `available` (contenu affiché en repli français) n'a pas d'entrée.
 */
import type { MetadataRoute } from 'next'
import { locales, type Locale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/routing'
import { HREFLANG } from './metadata'
import { abs } from './site'

type Entry = MetadataRoute.Sitemap[number]

export function localizedEntries(
  path: string,
  base: Omit<Entry, 'url' | 'alternates'>,
  available: readonly Locale[] = locales,
): MetadataRoute.Sitemap {
  const langs = locales.filter((l) => l === 'fr' || available.includes(l))
  const languages: Record<string, string> | undefined = langs.length > 1
    ? Object.fromEntries([...langs.map((l) => [HREFLANG[l], abs(localePath(l, path))]), ['x-default', abs(path)]])
    : undefined
  return langs.map((l) => ({ ...base, url: abs(localePath(l, path)), ...(languages ? { alternates: { languages } } : {}) }))
}
