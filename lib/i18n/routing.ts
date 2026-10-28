/**
 * URL par langue des PAGES PUBLIQUES (module pur, compatible Edge, testé par tests/i18n-routing.test.ts).
 *
 * - Français sans préfixe (`/aide`), anglais sous `/en/…`, portugais sous `/pt/…`.
 * - Seules les pages de la LISTE BLANCHE ci-dessous existent sous un préfixe : tout autre `/en|pt/…`
 *   (dont `/en/app`, `/en/admin`, `/en/api`, `/en/console/<x>`) répond 404, jamais servi.
 * - `/fr/…` (d'une page de la liste blanche) → redirection 308 vers l'URL sans préfixe.
 * - Jamais de redirection sur `Accept-Language` (Googlebot explore sans cookie ni langue).
 *
 * La middleware applique `decideLocaleRoute()` APRÈS la porte admin et l'anti-CSRF, AVANT la session.
 * La locale effective est transmise à i18n/request.ts par l'en-tête de requête `x-lp-locale`, toujours
 * réécrit (ou supprimé) par la middleware : une valeur envoyée par le client n'atteint jamais l'application.
 */
import { isLocale, type Locale } from './config'

/** Langues servies sous un préfixe d'URL (le français n'en a pas). */
export const PREFIXED_LOCALES = ['en', 'pt'] as const
export type PrefixedLocale = (typeof PREFIXED_LOCALES)[number]

/** En-tête INTERNE (middleware → i18n/request.ts) : locale imposée par l'URL d'une page publique. */
export const LOCALE_HEADER = 'x-lp-locale'
/** En-tête interne réservé (jamais accepté du client) : supprimé comme LOCALE_HEADER. */
export const PATH_HEADER = 'x-lp-path'
const INTERNAL_HEADERS = [LOCALE_HEADER, PATH_HEADER] as const

export const isPrefixedLocale = (v: unknown): v is PrefixedLocale => v === 'en' || v === 'pt'

// Un segment dynamique (slug d'article, code de territoire, fiche, catégorie, parcours) :
// minuscules ASCII, chiffres et tirets, comme les slugs validés par les pages. Rien d'encodé
// (%2F, %2E…), pas de point ni de barre oblique inverse : aucune traversée possible.
const SEG = '[a-z0-9]+(?:-[a-z0-9]+)*'

/** Liste blanche des pages publiques localisables (chemins SANS préfixe, sans requête). */
const PUBLIC_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/aide$/,
  /^\/blog$/,
  new RegExp(`^/blog/${SEG}$`),
  /^\/guide$/,
  new RegExp(`^/guide/${SEG}$`),
  new RegExp(`^/guide/${SEG}/${SEG}$`),
  new RegExp(`^/guide/${SEG}/(?:categorie|parcours)/${SEG}$`),
  /^\/legal\/(?:mentions|cgu|confidentialite)$/,
  /^\/don$/,
  /^\/installer$/,
  /^\/a-propos$/,
  /^\/onboarding\/(?:connexion|inscription)$/,
]

const MAX_PATH = 300

/** Le chemin (sans préfixe de langue, sans requête) est-il une page publique localisable ? */
export function isPublicLocalizable(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) return false
  return PUBLIC_PATTERNS.some((re) => re.test(path))
}

/**
 * Sépare le préfixe de langue d'un chemin : `/en/aide` → { locale: 'en', path: '/aide' },
 * `/pt` → { locale: 'pt', path: '/' }, `/fr/blog` → { locale: 'fr', path: '/blog' },
 * `/aide` → { locale: null, path: '/aide' }. Sensible à la casse (`/EN/…` n'est pas un préfixe).
 */
export function stripLocale(pathname: string): { locale: Locale | null; path: string } {
  const m = /^\/(fr|en|pt)(?=\/|$)(.*)$/.exec(pathname)
  if (!m) return { locale: null, path: pathname }
  return { locale: m[1] as Locale, path: m[2] || '/' }
}

/**
 * URL d'un lien interne dans une langue. Ne préfixe QUE les pages de la liste blanche
 * (`/app/**`, `/api`, `/onboarding` … restent tels quels), conserve `?requête` et `#ancre`,
 * et accepte un chemin déjà préfixé (idempotent). Tout ce qui n'est pas un chemin absolu
 * interne (`https:`, `mailto:`, `#ancre`, `//hôte`) est renvoyé inchangé.
 */
export function localePath(locale: string | null | undefined, href: string): string {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return href
  const cut = href.search(/[?#]/)
  const pathname = cut === -1 ? href : href.slice(0, cut)
  const rest = cut === -1 ? '' : href.slice(cut)
  const { locale: prefix, path } = stripLocale(pathname)
  if (!isPublicLocalizable(path)) return href
  const bare = prefix ? path : pathname
  if (!isPrefixedLocale(locale)) return `${bare}${rest}`
  return `/${locale}${bare === '/' ? '' : bare}${rest}`
}

/**
 * Lien « Créer un compte » des pages publiques : l'accueil de l'onboarding (`/onboarding`, hors liste
 * blanche) en français ; en EN/PT, directement le formulaire d'inscription localisé, pour rester dans la langue.
 */
export const signupPath = (locale: string | null | undefined) =>
  isPrefixedLocale(locale) ? localePath(locale, '/onboarding/inscription') : '/onboarding'

/** Raccourci pour un composant serveur asynchrone : `const lp = localePathFor(await getLocale())`. */
export const localePathFor = (locale: string | null | undefined) => (href: string) => localePath(locale, href)

export type LocaleRoute =
  /** Page servie telle quelle ; `locale` = langue imposée (fr sur une page publique sans préfixe) ou null (cookie). */
  | { kind: 'next'; locale: Locale | null }
  /** `/en|pt/<chemin>` de la liste blanche : réécriture interne vers `<chemin>`, langue imposée. */
  | { kind: 'rewrite'; locale: PrefixedLocale; path: string; setCookie?: PrefixedLocale }
  /** Redirection vers un chemin de la liste blanche (jamais une valeur libre : pas d'open redirect). */
  | { kind: 'redirect'; status: 307 | 308; location: string }
  /** Préfixe de langue sur un chemin hors liste blanche : 404. */
  | { kind: 'notFound'; locale: Locale }

/**
 * Décision de routage par langue (fonction pure, testée) :
 * - `/fr/<public>` → 308 vers `<public>` ; `/fr/<autre>` → 404 ;
 * - `/en|pt/<public>` → réécriture vers `<public>` (locale imposée) ; `/en|pt/<autre>` → 404 ;
 * - `<public>` sans préfixe : cookie `lp_locale` en|pt EXPLICITEMENT choisi (pas de marqueur
 *   `lp_locale_auto`) + GET/HEAD → 307 vers la version préfixée ; sinon français imposé (l'URL
 *   décide de la langue : un cookie mémorisé automatiquement ne redirige jamais) ;
 * - tout le reste (app, api, admin, console, onboarding…) : inchangé, langue du cookie.
 */
export function decideLocaleRoute(i: {
  pathname: string
  method?: string
  cookieLocale?: string | null
  /** Présence du cookie marqueur `lp_locale_auto` (lp_locale posé automatiquement, pas choisi). */
  cookieLocaleAuto?: boolean
}): LocaleRoute {
  const { locale: prefix, path } = stripLocale(i.pathname)
  if (prefix === 'fr') {
    return isPublicLocalizable(path) ? { kind: 'redirect', status: 308, location: path } : { kind: 'notFound', locale: 'fr' }
  }
  const method = (i.method ?? 'GET').toUpperCase()
  const safe = method === 'GET' || method === 'HEAD'
  if (isPrefixedLocale(prefix)) {
    if (!isPublicLocalizable(path)) return { kind: 'notFound', locale: prefix }
    // Premier passage sur /en|pt/… SANS aucun cookie lp_locale : on mémorise la langue d'arrivée,
    // pour que l'inscription et l'espace connecté (langue du cookie) la suivent. Jamais d'écrasement.
    const noCookie = i.cookieLocale === undefined || i.cookieLocale === null
    return safe && noCookie ? { kind: 'rewrite', locale: prefix, path, setCookie: prefix } : { kind: 'rewrite', locale: prefix, path }
  }
  if (!isPublicLocalizable(i.pathname)) return { kind: 'next', locale: null }
  if (safe && isPrefixedLocale(i.cookieLocale) && !i.cookieLocaleAuto) {
    return { kind: 'redirect', status: 307, location: localePath(i.cookieLocale, i.pathname) }
  }
  return { kind: 'next', locale: 'fr' }
}

/**
 * Attributs des cookies lp_locale et lp_locale_auto posés par la middleware
 * (identiques à setLocale, lib/i18n/actions.ts).
 */
export const localeCookieOptions = (production: boolean) =>
  ({ path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: production, httpOnly: false }) as const

/**
 * En-têtes transmis à l'application : copie de la requête SANS les en-têtes internes envoyés
 * par le client, puis `x-lp-locale` posé par la middleware si la langue est imposée par l'URL.
 */
export function forwardHeaders(source: Headers, locale: Locale | null): Headers {
  const h = new Headers(source)
  for (const name of INTERNAL_HEADERS) h.delete(name)
  if (locale && isLocale(locale)) h.set(LOCALE_HEADER, locale)
  return h
}
