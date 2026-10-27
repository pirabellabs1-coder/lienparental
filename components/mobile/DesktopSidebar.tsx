'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Crown } from 'lucide-react'
import { PLAN_NAME, type PlanId } from '@/components/profil/pricing'
import { onBillingChanged } from '@/lib/billing/client'
import { Logo } from '@/components/brand/Logo'
import { SearchTrigger } from '@/components/search/SearchTrigger'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { cn } from '@/lib/cn'
import { NAV_MAIN as MAIN, NAV_SECONDARY as SECONDARY, NAV_TOOLS as TOOLS, activeNavHref, type NavItem } from './navItems'

// Navigation tablette et ordinateur (≥ md). Sur téléphone : barre d'onglets du bas + menu complet.
export function DesktopSidebar({ plan = 'gratuit' }: { plan?: PlanId }) {
  const t = useTranslations('appnav')
  const pathname = usePathname()
  const router = useRouter()
  // Abonnement modifié dans un autre onglet : la carte (et les droits affichés) se mettent à jour.
  useEffect(() => onBillingChanged(() => router.refresh()), [router])
  const paid = plan !== 'gratuit'
  const onBilling = pathname === '/app/abonnement' || pathname.startsWith('/app/abonnement/')
  const match = activeNavHref(pathname)
  const active = (href: string) => match === href

  const item = ({ href, labelKey, icon: Icon }: NavItem) => (
    <li key={href}>
      <Link
        href={href}
        aria-current={active(href) ? 'page' : undefined}
        className={cn(
          'flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-semibold transition-colors',
          active(href) ? 'bg-leaf-50 text-leaf-600' : 'text-night-800 hover:bg-night-50',
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={active(href) ? 2.2 : 1.7} aria-hidden />
        {t(labelKey)}
      </Link>
    </li>
  )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto overscroll-contain border-r border-night-100 bg-white px-4 py-6 [scrollbar-width:thin] md:flex">
      <Link href="/app" aria-label="Lien Parental, accueil" className="px-3"><Logo size="md" /></Link>
      <SearchTrigger variant="sidebar" className="mt-6" />
      <nav aria-label={t('mainNav')} className="mt-4 flex flex-1 flex-col">
        <ul className="space-y-1">{MAIN.map(item)}</ul>
        <p className="mb-1 mt-5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-night-500">{t('groupCoparenting')}</p>
        <ul className="space-y-1">{TOOLS.map(item)}</ul>
        <ul className="mt-6 space-y-1 border-t border-night-100 pt-4">
          {SECONDARY.map(item)}
          <li><LogoutButton variant="sidebar" /></li>
        </ul>
      </nav>
      {/* Abonné : raccourci « Mon abonnement » ; Gratuit : invitation à passer à Premium. */}
      <Link
        href={paid ? '/app/abonnement' : '/app/abonnement?formule=premium'}
        aria-current={onBilling ? 'page' : undefined}
        className={cn(
          'mt-4 flex shrink-0 items-center gap-3 rounded-2xl p-4 ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
          paid ? 'bg-night-50 ring-night-100 hover:bg-night-100/70' : 'bg-gold-50 ring-gold-200/60 hover:bg-gold-100/70',
        )}
      >
        <Crown className={cn('h-6 w-6 shrink-0', paid ? 'text-night-900' : 'text-gold-600')} strokeWidth={1.7} aria-hidden />
        <span className="text-[13px] leading-snug">
          <span className="block font-bold text-night-900">{paid ? t('mySubscription') : t('upgradeToPremium')}</span>
          <span className="text-night-700">{paid ? t('planPrefix', { plan: PLAN_NAME[plan] }) : t('premiumTeaser')}</span>
        </span>
      </Link>
    </aside>
  )
}
