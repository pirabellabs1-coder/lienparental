// Territoires du Guide parental (accueil, pied de page).
// Silhouettes volontairement abstraites et sobres (pas de cartes géographiques inventées).
// Seul le contenu Guyane existe (content/guide/guyane) : les autres territoires sont annoncés « Bientôt ».
export const TERRITORIES = [
  { code: 'france', name: 'France', available: false, path: 'M25 4 L43 14 L43 34 L25 44 L7 34 L7 14 Z' },
  { code: 'guyane', name: 'Guyane', available: true, path: 'M14 8 L34 6 L42 16 L40 34 L28 44 L12 40 L8 22 Z' },
  { code: 'martinique', name: 'Martinique', available: false, path: 'M18 6 C26 6 30 14 34 20 C40 28 38 40 28 42 C20 44 12 38 12 30 C12 22 10 6 18 6 Z' },
  { code: 'guadeloupe', name: 'Guadeloupe', available: false, path: 'M6 22 C6 12 18 10 22 18 C24 22 26 22 28 18 C32 10 44 12 44 24 C44 34 34 38 28 30 C26 28 24 28 22 30 C16 38 6 32 6 22 Z' },
  { code: 'reunion', name: 'La Réunion', available: false, path: 'M24 6 C36 6 44 16 42 28 C40 40 30 44 20 42 C10 40 6 30 8 20 C10 12 16 6 24 6 Z' },
  { code: 'mayotte', name: 'Mayotte', available: false, path: 'M22 4 C30 6 28 16 32 22 C36 28 34 40 26 44 C20 46 16 40 18 32 C20 24 14 18 16 10 C17 6 19 4 22 4 Z' },
] as const

export function TerritoryShape({ path, available, className }: { path: string; available: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 50 50" aria-hidden className={className}>
      <path d={path} className={available ? 'fill-leaf-400' : 'fill-night-200'} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
