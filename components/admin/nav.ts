import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  FileStack,
  Newspaper,
  MessageSquareHeart,
  LifeBuoy,
  ScrollText,
  Settings,
} from 'lucide-react'

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
export type NavGroup = { title: string; items: NavItem[] }

/**
 * Navigation du back-office, regroupée par domaine pour une lecture claire.
 * Partagée par la Sidebar (bureau) et la TopBar (mobile).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/admin/comptes', label: 'Comptes', icon: Users },
    ],
  },
  {
    title: 'Contenus',
    items: [
      { href: '/admin/contenus/faq', label: 'Contenus', icon: FileText },
      { href: '/admin/guides', label: 'Guides', icon: BookOpen },
      { href: '/admin/modeles', label: 'Modèles', icon: FileStack },
      { href: '/admin/blog', label: 'Blog', icon: Newspaper },
      { href: '/admin/temoignages', label: 'Témoignages', icon: MessageSquareHeart },
    ],
  },
  {
    title: 'Exploitation',
    items: [
      { href: '/admin/support', label: 'Support', icon: LifeBuoy },
      { href: '/admin/journaux', label: 'Journaux', icon: ScrollText },
      { href: '/admin/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
]

/** L'élément de nav actif pour un chemin donné (le plus spécifique l'emporte). */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/admin') return pathname === '/admin'
  // « Contenus » couvre /admin/contenus/* quel que soit l'onglet (faq, tutoriels…).
  if (href === '/admin/contenus/faq') return pathname.startsWith('/admin/contenus')
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Initiales pour l'avatar (prénom/nom, repli sur l'e-mail). */
export function initials(name: string, email: string): string {
  const n = name.trim()
  if (n) {
    const parts = n.split(/\s+/)
    return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toLocaleUpperCase('fr')
  }
  return (email.trim()[0] ?? 'A').toLocaleUpperCase('fr')
}
