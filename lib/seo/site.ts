/**
 * Constantes SEO partagées (module pur).
 * - SITE : origine canonique de production, sans barre finale.
 * - guidePaths : chemins publics du Guide (index, territoire, fiches, catégories, parcours),
 *   utilisés par le sitemap, llms.txt et les liens internes. Voir docs/SEO-AUDIT.md.
 */
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://lienparental.fr').replace(/\/+$/, '')

export const ORG_ID = `${SITE}/#organization`
export const WEBSITE_ID = `${SITE}/#website`
export const APP_ID = `${SITE}/#app`

/** Nom de marque (jamais traduit). */
export const SITE_NAME = 'Lien Parental'
/** Éditeur du service (mentions légales). */
export const PUBLISHER_NAME = 'Pirabel Labs'
/** Adresse de contact publiée dans les mentions légales. */
export const CONTACT_EMAIL = 'contact@lienparental.fr'
/** Logo carré utilisé par les données structurées (512×512). */
export const LOGO_PATH = '/icons/icon-512.png'
/** Image Open Graph par défaut (app/opengraph-image.tsx, 1200×630). */
export const OG_IMAGE_PATH = '/opengraph-image'

/** Chemins publics du Guide (sans origine). Le territoire par défaut est la Guyane. */
export const guidePaths = {
  index: '/guide',
  territoire: (code: string) => `/guide/${code}`,
  fiche: (code: string, slug: string) => `/guide/${code}/${slug}`,
  categorie: (code: string, cat: string) => `/guide/${code}/categorie/${cat}`,
  parcours: (code: string, slug: string) => `/guide/${code}/parcours/${slug}`,
} as const

export const abs = (path: string) => `${SITE}${path.startsWith('/') ? path : `/${path}`}`
