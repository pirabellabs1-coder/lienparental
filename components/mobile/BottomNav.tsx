'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Home, NotebookText, CalendarDays, FolderLock, LayoutGrid } from 'lucide-react'
import { Sheet } from '@/components/messages/Sheet'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { cn } from '@/lib/cn'
import { NAV_MAIN, NAV_SECONDARY, NAV_TOOLS, activeNavHref, navPrefetch, type NavItem } from './navItems'

const TABS = [
  { href: '/app',            labelKey: 'accueil',    icon: Home },
  { href: '/app/journal',    labelKey: 'journal',    icon: NotebookText },
  { href: '/app/calendrier', labelKey: 'calendrier', icon: CalendarDays },
  { href: '/app/coffre',     labelKey: 'coffre',     icon: FolderLock },
] as const

// Ces sections vivent sous un autre préfixe mais appartiennent à un onglet. Le reste relève du « Menu ».
const ALIASES: Record<string, string> = {
  '/app/garde': '/app/calendrier',
  '/app/frais': '/app/journal',
}

const MENU_GROUPS: { titleKey: 'groupDaily' | 'groupCoparenting' | 'groupAccount'; items: readonly NavItem[] }[] = [
  { titleKey: 'groupDaily', items: NAV_MAIN.filter(i => i.href !== '/app') },
  { titleKey: 'groupCoparenting', items: NAV_TOOLS },
  { titleKey: 'groupAccount', items: NAV_SECONDARY },
]

// Barre d'onglets du téléphone : 4 rubriques + « Menu », qui ouvre toutes les rubriques de l'application.
export function BottomNav() {
  const t = useTranslations('appnav')
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const alias = Object.keys(ALIASES).find(p => pathname.startsWith(p))
  const current = alias ? ALIASES[alias] : pathname
  // Témoignages vit sous /app/coffre mais appartient au menu.
  const onTab = (href: string) => (href === '/app' ? current === '/app' : current.startsWith(href) && !current.startsWith('/app/coffre/temoignages'))
  const inMenu = !TABS.some(t => onTab(t.href))
  const activeItem = activeNavHref(pathname)

  // Ferme le menu après une navigation.
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const tabClass = (active: boolean) => cn(
    'flex h-16 w-full min-w-[44px] flex-col items-center justify-center gap-1 transition-colors',
    active ? 'text-leaf-500' : 'text-night-900 hover:text-night-700',
  )

  return (
    <>
      <nav aria-label={t('mainNav')} className="fixed inset-x-0 bottom-0 z-40">
        <div
          className="mx-auto max-w-[430px] border-t border-night-100 bg-white"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ul className="flex items-stretch justify-around">
            {TABS.map(({ href, labelKey, icon: Icon }) => {
              const active = onTab(href)
              return (
                <li key={href} className="flex-1">
                  <Link href={href} prefetch={navPrefetch(href)} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} aria-hidden />
                    <span className={cn('text-[11px]', active ? 'font-bold' : 'font-medium')}>{t(labelKey)}</span>
                  </Link>
                </li>
              )
            })}
            <li className="flex-1">
              <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} className={tabClass(inMenu)}>
                <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={inMenu ? 2.4 : 1.8} fill={inMenu ? 'currentColor' : 'none'} fillOpacity={inMenu ? 0.15 : 0} aria-hidden />
                <span className={cn('text-[11px]', inMenu ? 'font-bold' : 'font-medium')}>{t('menu')}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('menu')} description={t('allSectionsDesc')}>
        <nav aria-label={t('allSections')} className="mt-2 space-y-5">
          {MENU_GROUPS.map(group => (
            <div key={group.titleKey}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-night-500">{t(group.titleKey)}</p>
              <ul className="grid grid-cols-2 gap-2">
                {group.items.map(({ href, labelKey, icon: Icon }) => {
                  const active = activeItem === href
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        prefetch={navPrefetch(href)}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          'flex min-h-[52px] items-center gap-3 rounded-2xl px-3 text-[14px] font-semibold ring-1 transition-colors',
                          active ? 'bg-leaf-50 text-leaf-700 ring-leaf-200' : 'bg-white text-night-900 ring-night-100 hover:bg-night-50',
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
                        <span className="leading-tight">{t(labelKey)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div className="border-t border-night-100 pt-3">
            <LogoutButton variant="sidebar" />
          </div>
        </nav>
      </Sheet>
    </>
  )
}
