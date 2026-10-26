'use client'
import Link from 'next/link'
import { useState } from 'react'
import {
  Menu,
  X,
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

const items = [
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

export function TopBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 bg-night-900 text-night-50 border-b border-night-800">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/admin" className="flex flex-col leading-tight">
            <span className="font-display text-base text-white">Lien Parental</span>
            <span className="text-[10px] uppercase tracking-wider text-gold-300">Admin</span>
          </Link>
          <button
            type="button"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl2 text-night-100 hover:bg-night-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open && (
        <div
          id="admin-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu admin"
          className="lg:hidden fixed inset-x-0 top-14 bottom-0 z-30 bg-night-900 text-night-50 overflow-y-auto"
        >
          <nav className="px-3 py-4" aria-label="Sections">
            <ul className="space-y-1">
              {items.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl2 px-3 py-3 text-sm text-night-100 hover:bg-night-800 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
              <li>
                {/* TODO: Supabase service_role — câbler signOut */}
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl2 px-3 py-3 text-sm text-night-100 hover:bg-night-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Se déconnecter</span>
                  </button>
                </form>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </>
  )
}
