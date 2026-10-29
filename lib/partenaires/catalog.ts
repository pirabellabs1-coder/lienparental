/**
 * Partenaires affichés sur /partenaires, par catégorie (module pur).
 *
 * N'ajouter un partenaire (nom, logo, photo) QU'APRÈS signature du partenariat et accord ÉCRIT
 * sur l'usage de son nom, de son logo ou de son image (même règle que le bandeau de l'accueil,
 * components/accueil/Partners.tsx). Fichiers dans public/partenaires/ (logos) ; pour un créateur
 * de contenu, photo fournie par lui-même. Tant qu'une catégorie est vide, la page affiche des
 * emplacements neutres et le badge « Partenariats en préparation ».
 */

export const PARTNER_CATEGORIES = ['institution', 'association', 'createur', 'professionnel'] as const
/** Catégories toujours affichées (maquette) ; les autres n'apparaissent qu'avec au moins un partenaire. */
export const CORE_CATEGORIES: readonly PartnerCategory[] = ['institution', 'association', 'createur']
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
  /** Logo d'exemple fictif (jamais en production) : badge « Exemple » à l'affichage. */
  demo?: boolean
}

export const PARTNERS: Partner[] = [
  // { name: 'Caisse d’allocations familiales de Guyane', category: 'institution', image: '/partenaires/caf-guyane.svg', href: 'https://www.caf.fr' },
]

/**
 * Logos et avatars FICTIFS (public/partenaires/demo/) : aucun organisme ni aucune personne réels.
 * Montrés hors production seulement (local, préversions Vercel), pour juger la mise en page et le
 * défilement tant qu'aucun partenariat n'est signé.
 */
export const DEMO_PARTNERS: Partner[] = [
  { name: 'Agence territoriale des Familles', category: 'institution', image: '/partenaires/demo/institution-1.svg', demo: true },
  { name: 'Observatoire de l’Enfance', category: 'institution', image: '/partenaires/demo/institution-2.svg', demo: true },
  { name: 'Maison des Droits de l’Enfant', category: 'institution', image: '/partenaires/demo/institution-3.svg', demo: true },
  { name: 'Espace Public Familles', category: 'institution', image: '/partenaires/demo/institution-4.svg', demo: true },
  { name: 'Conseil des Territoires', category: 'institution', image: '/partenaires/demo/institution-5.svg', demo: true },
  { name: 'Bureau Enfance Jeunesse', category: 'institution', image: '/partenaires/demo/institution-6.svg', demo: true },
  { name: 'Point Info Familles', category: 'institution', image: '/partenaires/demo/institution-7.svg', demo: true },
  { name: 'Familles Solidaires', category: 'association', image: '/partenaires/demo/association-1.svg', demo: true },
  { name: 'Réseau Parents Ensemble', category: 'association', image: '/partenaires/demo/association-2.svg', demo: true },
  { name: 'Collectif Enfance & Liens', category: 'association', image: '/partenaires/demo/association-3.svg', demo: true },
  { name: 'Main dans la Main', category: 'association', image: '/partenaires/demo/association-4.svg', demo: true },
  { name: 'Écoute Parents', category: 'association', image: '/partenaires/demo/association-5.svg', demo: true },
  { name: 'Les Liens du Cœur', category: 'association', image: '/partenaires/demo/association-6.svg', demo: true },
  { name: 'Parents Relais', category: 'association', image: '/partenaires/demo/association-7.svg', demo: true },
  { name: 'Maman en Lumière', category: 'createur', image: '/partenaires/demo/createur-1.svg', tagline: 'Parent solo', demo: true, socials: [{ network: 'instagram', href: '#' }, { network: 'tiktok', href: '#' }] },
  { name: 'Papa Au Quotidien', category: 'createur', image: '/partenaires/demo/createur-2.svg', tagline: 'Parentalité', demo: true, socials: [{ network: 'instagram', href: '#' }, { network: 'youtube', href: '#' }] },
  { name: 'Kids & Soleil', category: 'createur', image: '/partenaires/demo/createur-3.svg', tagline: 'Activités en famille', demo: true, socials: [{ network: 'tiktok', href: '#' }] },
  { name: 'Famille en Équilibre', category: 'createur', image: '/partenaires/demo/createur-4.svg', tagline: 'Coparentalité', demo: true, socials: [{ network: 'instagram', href: '#' }, { network: 'tiktok', href: '#' }] },
  { name: 'Parents Positifs', category: 'createur', image: '/partenaires/demo/createur-5.svg', tagline: 'Éducation', demo: true, socials: [{ network: 'instagram', href: '#' }, { network: 'tiktok', href: '#' }] },
  { name: 'Duo de Parents', category: 'createur', image: '/partenaires/demo/createur-6.svg', tagline: 'Vie de famille', demo: true, socials: [{ network: 'instagram', href: '#' }, { network: 'youtube', href: '#' }] },
  { name: 'Tata Astuces', category: 'createur', image: '/partenaires/demo/createur-7.svg', tagline: 'Astuces du quotidien', demo: true, socials: [{ network: 'tiktok', href: '#' }] },
]

/** Emplacements neutres affichés dans une catégorie encore vide. */
export const EMPTY_SLOTS = 2

export const partnersOf = (category: PartnerCategory, list: readonly Partner[] = PARTNERS): Partner[] =>
  list.filter((p) => p.category === category)

/**
 * Partenaires à afficher pour une catégorie : les vrais s'il y en a ; sinon, hors production,
 * les exemples fictifs ; sinon rien (la page montre alors des emplacements « Bientôt ici »).
 */
export function displayedPartners(category: PartnerCategory, showDemo: boolean, real: readonly Partner[] = PARTNERS): Partner[] {
  const list = partnersOf(category, real)
  // Pas d'exemples hors des catégories de la maquette (« professionnel » n'apparaît qu'avec un vrai partenaire).
  if (!CORE_CATEGORIES.includes(category)) return list
  return list.length || !showDemo ? list : partnersOf(category, DEMO_PARTNERS)
}

/** Exemples autorisés ? Jamais en production Vercel ; oui en local et sur les préversions. */
export const demoPartnersAllowed = (env: Record<string, string | undefined> = process.env): boolean =>
  env.NEXT_PUBLIC_PARTNERS_DEMO === 'off' ? false : env.VERCEL_ENV !== 'production'
