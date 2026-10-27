'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, LogOut } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NAV_GROUPS, isNavActive, initials } from './nav'
import type { AdminIdentity } from './Sidebar'

export function TopBar({ user }: { user?: AdminIdentity }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 bg-gradient-to-b from-night-900 to-night-950 text-night-50 border-b border-white/5">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-leaf-500/15 ring-1 ring-leaf-400/30">
              <span className="font-display text-sm font-bold text-leaf-300">L</span>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-sm font-bold text-white">Lien Parental</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-leaf-300/90">Administration</span>
            </span>
          </Link>
          <button
            type="button"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-night-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400/60"
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
          className="lg:hidden fixed inset-x-0 top-14 bottom-0 z-30 bg-gradient-to-b from-night-900 to-night-950 text-night-50 overflow-y-auto"
        >
          <nav className="px-3 py-4" aria-label="Sections">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-5 last:mb-2">
                <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-night-300/60">{group.title}</p>
                <ul className="space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isNavActive(pathname, href)
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400/60',
                            active ? 'bg-leaf-500/15 font-semibold text-white' : 'text-night-100 hover:bg-white/5',
                          )}
                        >
                          <Icon className={cn('h-[18px] w-[18px]', active ? 'text-leaf-300' : 'text-night-300')} />
                          <span>{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/5 p-3">
            {user && (
              <div className="mb-2 flex items-center gap-3 px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-500/20 text-[12.5px] font-bold text-leaf-200 ring-1 ring-leaf-400/20">
                  {initials(user.name, user.email)}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-semibold text-white">{user.name || 'Administrateur'}</span>
                  <span className="block truncate text-[11.5px] text-night-300">{user.email}</span>
                </span>
              </div>
            )}
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-night-100 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400/60"
              >
                <LogOut className="h-[18px] w-[18px] text-night-300" />
                <span>Se déconnecter</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
