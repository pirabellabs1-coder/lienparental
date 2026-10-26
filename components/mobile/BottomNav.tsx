'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, NotebookText, CalendarDays, FolderLock, User } from 'lucide-react'
import { cn } from '@/lib/cn'

const TABS = [
  { href: '/app',            label: 'Accueil',     icon: Home },
  { href: '/app/journal',    label: 'Journal',     icon: NotebookText },
  { href: '/app/calendrier', label: 'Calendrier',  icon: CalendarDays },
  { href: '/app/coffre',     label: 'Coffre-fort', icon: FolderLock },
  { href: '/app/profil',     label: 'Profil',      icon: User },
] as const

// Ces sections vivent sous un autre préfixe mais appartiennent à l'onglet Profil / Accueil.
const ALIASES: Record<string, string> = {
  '/app/premium': '/app/profil',
  '/app/aide': '/app/profil',
  '/app/enfants': '/app',
  '/app/coach': '/app',
  '/app/notifications': '/app',
  '/app/garde': '/app/calendrier',
  '/app/messages': '/app',
  '/app/dossier': '/app/coffre',
  '/app/frais': '/app/journal',
  '/app/guide': '/app',
  '/app/coparents': '/app',
  '/app/modeles': '/app',
  '/app/etats': '/app',
}

export function BottomNav() {
  const pathname = usePathname()
  const alias = Object.keys(ALIASES).find(p => pathname.startsWith(p))
  const current = alias ? ALIASES[alias] : pathname

  const isActive = (href: string) => (href === '/app' ? current === '/app' : current.startsWith(href))

  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40">
      <div
        className="mx-auto max-w-[430px] border-t border-night-100 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <ul className="flex items-stretch justify-around">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-16 min-w-[44px] flex-col items-center justify-center gap-1 transition-colors',
                    active ? 'text-leaf-500' : 'text-night-900 hover:text-night-700',
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} aria-hidden />
                  <span className={cn('text-[11px]', active ? 'font-bold' : 'font-medium')}>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
