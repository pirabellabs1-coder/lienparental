/**
 * Partenaires affichés sur /partenaires, par catégorie (module pur).
 *
 * N'ajouter un partenaire (nom, logo, photo) QU'APRÈS signature du partenariat et accord ÉCRIT
 * sur l'usage de son nom, de son logo ou de son image (même règle que le bandeau de l'accueil,
 * components/accueil/Partners.tsx). Fichiers dans public/partenaires/ (logos) ; pour un créateur
 * de contenu, photo fournie par lui-même. Tant qu'une catégorie est vide, la page affiche des
 * emplacements neutres et le badge « Partenariats en préparation ».
 */

export const PARTNER_CATEGORIES = ['institution', 'association', 'createur'] as const
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number]

export type PartnerSocial = { network: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin'; href: string }

export type Partner = {
  name: string
  category: PartnerCategory
  /** Logo (organisme) ou photo (créateur), chemin sous /public. */
  image: string
  /** Sous-titre court : territoire, thème (« Parent solo », « Guyane »…). Texte fourni par le partenaire. */
  tagline?: string
  href?: string
  socials?: PartnerSocial[]
}

export const PARTNERS: Partner[] = [
  // { name: 'Caisse d’allocations familiales de Guyane', category: 'institution', image: '/partenaires/caf-guyane.svg', href: 'https://www.caf.fr' },
]

/** Emplacements neutres affichés dans une catégorie encore vide. */
export const EMPTY_SLOTS = 2

export const partnersOf = (category: PartnerCategory, list: readonly Partner[] = PARTNERS): Partner[] =>
  list.filter((p) => p.category === category)
