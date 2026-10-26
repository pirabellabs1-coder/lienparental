import { Home, NotebookText, CalendarDays, FolderLock, Sparkles, Users, User, LifeBuoy, Bell, MessageSquareQuote, Compass, MessageCircle, FileStack, Repeat, UsersRound } from 'lucide-react'

// Rubriques de l'application, partagées par le menu latéral (tablette, ordinateur) et le menu mobile.
// Ordre = priorités produit (docs/RECAP_FONCTIONNEL_V2.md). Les finances vivent dans le Journal.
export const NAV_MAIN = [
  { href: '/app', label: 'Accueil', icon: Home },
  { href: '/app/enfants', label: 'Mes enfants', icon: Users },
  { href: '/app/journal', label: 'Journal', icon: NotebookText },
  { href: '/app/calendrier', label: 'Calendrier', icon: CalendarDays },
  { href: '/app/coach', label: 'Coach IA', icon: Sparkles },
  { href: '/app/coffre', label: 'Coffre-fort', icon: FolderLock },
  { href: '/app/coffre/temoignages', label: 'Témoignages', icon: MessageSquareQuote },
  { href: '/app/guide', label: 'Guide parental', icon: Compass },
]
// Outils de coparentalité, remis en avant à la demande du client.
export const NAV_TOOLS = [
  { href: '/app/messages', label: 'Messages', icon: MessageCircle },
  { href: '/app/garde', label: 'Planning de garde', icon: Repeat },
  { href: '/app/dossier', label: 'Mon dossier JAF', icon: FileStack },
  { href: '/app/coparents', label: 'Parents liés', icon: UsersRound },
]
export const NAV_SECONDARY = [
  { href: '/app/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/profil', label: 'Profil', icon: User },
  { href: '/app/aide', label: 'Centre d’aide', icon: LifeBuoy },
]

export type NavItem = (typeof NAV_MAIN)[number]

/** Rubrique active : l'entrée la plus spécifique gagne (Témoignages vit sous /app/coffre). */
export function activeNavHref(pathname: string): string | undefined {
  return [...NAV_MAIN, ...NAV_TOOLS, ...NAV_SECONDARY]
    .filter(({ href }) => (href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
