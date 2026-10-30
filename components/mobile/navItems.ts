import { Home, NotebookText, CalendarDays, FolderLock, Sparkles, Users, User, LifeBuoy, Bell, MessageSquareQuote, Compass, MessageCircle, FileStack, Repeat, UsersRound } from 'lucide-react'

// Rubriques de l'application, partagées par le menu latéral (tablette, ordinateur) et le menu mobile.
// Ordre = priorités produit (docs/RECAP_FONCTIONNEL_V2.md). Les finances vivent dans le Journal.
export const NAV_MAIN = [
  { href: '/app', labelKey: 'accueil', icon: Home },
  { href: '/app/enfants', labelKey: 'enfants', icon: Users },
  { href: '/app/journal', labelKey: 'journal', icon: NotebookText },
  { href: '/app/calendrier', labelKey: 'calendrier', icon: CalendarDays },
  { href: '/app/coach', labelKey: 'coach', icon: Sparkles },
  { href: '/app/coffre', labelKey: 'coffre', icon: FolderLock },
  { href: '/app/coffre/temoignages', labelKey: 'temoignages', icon: MessageSquareQuote },
  { href: '/app/guide', labelKey: 'guide', icon: Compass },
]
// Outils de coparentalité, remis en avant à la demande du client.
export const NAV_TOOLS = [
  { href: '/app/messages', labelKey: 'messages', icon: MessageCircle },
  { href: '/app/garde', labelKey: 'garde', icon: Repeat },
  { href: '/app/dossier', labelKey: 'dossier', icon: FileStack },
  { href: '/app/coparents', labelKey: 'coparents', icon: UsersRound },
]
export const NAV_SECONDARY = [
  { href: '/app/notifications', labelKey: 'notifications', icon: Bell },
  { href: '/app/profil', labelKey: 'profil', icon: User },
  { href: '/app/aide', labelKey: 'aide', icon: LifeBuoy },
]

export type NavItem = (typeof NAV_MAIN)[number]

/**
 * Rubriques préchargées EN ENTIER par les menus (prefetch={true}) : le clic les affiche sans attendre
 * le serveur. Uniquement des pages client sans donnée rendue côté serveur (leurs données arrivent
 * après coup, depuis le navigateur) : une copie préchargée ne peut donc jamais être périmée.
 * Jamais le coffre-fort ni le dossier : leur garde serveur (verrou) doit être évaluée au clic.
 * Les autres rubriques sont préchargées jusqu'à leur loading.tsx (squelette immédiat au clic).
 */
export const FULL_PREFETCH: ReadonlySet<string> = new Set([
  '/app', '/app/enfants', '/app/journal', '/app/calendrier', '/app/coach',
  '/app/messages', '/app/garde', '/app/coparents', '/app/notifications',
])

/** Valeur de `prefetch` de next/link pour une rubrique du menu (undefined = préchargement automatique). */
export const navPrefetch = (href: string): true | undefined => (FULL_PREFETCH.has(href) ? true : undefined)

/** Rubrique active : l'entrée la plus spécifique gagne (Témoignages vit sous /app/coffre). */
export function activeNavHref(pathname: string): string | undefined {
  return [...NAV_MAIN, ...NAV_TOOLS, ...NAV_SECONDARY]
    .filter(({ href }) => (href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
