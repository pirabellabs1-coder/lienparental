'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NAV_GROUPS, isNavActive, initials } from './nav'

export type AdminIdentity = { name: string; email: string }

export function Sidebar({ user }: { user?: AdminIdentity }) {
  const pathname = usePathname()
  return (
    <aside
      className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-gradient-to-b from-night-900 to-night-950 text-night-50 border-r border-white/5"
      aria-label="Navigation admin"
    >
      <div className="px-5 py-5 border-b border-white/5">
        <Link href="/admin" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-leaf-500/15 ring-1 ring-leaf-400/30">
            <span className="font-display text-lg font-bold text-leaf-300">L</span>
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-bold text-white">Lien Parental</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-leaf-300/90">Administration</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]" aria-label="Sections">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5 last:mb-0">
            <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-night-300/60">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavActive(pathname, href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400/60',
                        active
                          ? 'bg-leaf-500/15 font-semibold text-white'
                          : 'text-night-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {active && <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-leaf-400" />}
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-leaf-300' : 'text-night-300 group-hover:text-night-100')} />
                      <span className="truncate">{label}</span>
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
          <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
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
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-night-200 hover:bg-white/5 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400/60"
          >
            <LogOut className="h-[18px] w-[18px] text-night-300" />
            <span>Se déconnecter</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
