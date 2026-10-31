/**
 * Pages publiques indexables hors blog et Guide (module pur) : chemin, date de dernière
 * modification RÉELLE du contenu (à mettre à jour quand le texte de la page change),
 * priorité et fréquence pour le sitemap. Les pages légales lisent leur date « Mise à jour le »
 * ici : une seule source pour l'affichage et le sitemap.
 */
export type PublicPage = {
  path: string
  /** Date ISO (AAAA-MM-JJ) de la dernière modification du contenu. */
  lastModified: string
  priority: number
  changeFrequency: 'weekly' | 'monthly' | 'yearly'
}

export const LEGAL_UPDATED = {
  mentions: '2026-10-25',
  cgu: '2026-10-29',
  confidentialite: '2026-10-31',
} as const

export const PUBLIC_PAGES: PublicPage[] = [
  { path: '/', lastModified: '2026-10-27', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/aide', lastModified: '2026-10-27', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/a-propos', lastModified: '2026-10-27', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/installer', lastModified: '2026-10-26', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/partenaires', lastModified: '2026-10-29', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/partenaires/candidature', lastModified: '2026-10-29', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/onboarding/inscription', lastModified: '2026-10-26', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/onboarding/connexion', lastModified: '2026-10-26', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/don', lastModified: '2026-10-26', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/mentions', lastModified: LEGAL_UPDATED.mentions, priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/cgu', lastModified: LEGAL_UPDATED.cgu, priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/confidentialite', lastModified: LEGAL_UPDATED.confidentialite, priority: 0.4, changeFrequency: 'yearly' },
]

/** Date ISO → Date UTC (minuit). */
export const isoDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
