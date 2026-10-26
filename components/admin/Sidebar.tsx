'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/cn'

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }

const items: Item[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/comptes', label: 'Comptes', icon: Users },
  { href: '/admin/contenus/faq', label: 'Contenus', icon: FileText },
  { href: '/admin/guides', label: 'Guides', icon: BookOpen },
  { href: '/admin/modeles', label: 'Modèles', icon: FileStack },
  { href: '/admin/blog', label: 'Blog', icon: Newspaper },
  { href: '/admin/temoignages', label: 'Témoignages', icon: MessageSquareHeart },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy },
  { href: '/admin/journaux', label: 'Journaux', icon: ScrollText },
  { href: '/admin/parametres', label: 'Paramètres', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside
      className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-night-900 text-night-50 border-r border-night-800"
      aria-label="Navigation admin"
    >
      <div className="px-6 py-6 border-b border-night-800">
        <Link href="/admin" className="flex flex-col leading-tight">
          <span className="font-display text-xl text-white">Lien Parental</span>
          <span className="text-xs uppercase tracking-wider text-gold-300">Admin</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Sections">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname?.startsWith(href))
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl2 px-3 py-2.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
                    active
                      ? 'bg-night-800 text-white font-medium'
                      : 'text-night-200 hover:bg-night-800/60 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-night-800 p-3">
        {/* TODO: Supabase service_role — câbler Supabase auth signOut */}
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl2 px-3 py-2.5 text-sm text-night-200 hover:bg-night-800/60 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            <LogOut className="h-4 w-4" />
            <span>Se déconnecter</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
