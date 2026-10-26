'use client'

import Link from 'next/link'
import { Bell, ChevronRight, CircleUserRound, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/brand/Logo'
import { btn } from '@/components/onboarding/styles'
import { ChildAvatar, ChildStatusBadge } from '@/components/enfants/ChildBits'
import { useChildren } from '@/components/enfants/useChild'
import { childAgeLabel, mockUser } from '@/lib/mock-data'
import { useAccountProfile } from '@/lib/auth/browser'
import { useUnreadNotificationsCount } from '@/lib/data/notifications'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'

const DEMO_PROFILE = { prenom: mockUser.prenom, nom: mockUser.nom, email: mockUser.email, memberSince: '' }

// M04 — Accueil « Mes enfants ». RLS Supabase : `children` filtré par user_id.
export default function EnfantsPage() {
  const { data, loading, error, refresh } = useChildren()
  const children = data ?? []
  // Supabase : public.users (RLS) ; démonstration : profil fictif.
  const { profile } = useAccountProfile(DEMO_PROFILE)
  const unread = useUnreadNotificationsCount()

  return (
    <div className="w-full px-4 pb-8 pt-3 md:px-6">
      {/* Mobile top bar (desktop navigation is provided by the app shell) */}
      <div className="flex items-center justify-between md:hidden">
        <Logo size="sm" />
        <div className="flex items-center">
          <Link
            href="/app/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
            className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Bell className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
          <Link href="/app/profil" aria-label="Mon profil" className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50">
            <CircleUserRound className="h-6 w-6" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <header className="mt-5 md:mt-2">
        <h1 className="text-[20px] font-extrabold text-night-900">
          {profile.prenom ? `Bonjour ${profile.prenom}` : 'Bonjour'} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-sm text-night-600">Voici vos enfants</p>
      </header>

      <Link href="/app/enfants/nouveau" className={cn(btn.primary, 'mt-5 w-full md:w-auto md:px-8')}>
        <Plus className="h-5 w-5" aria-hidden="true" />
        Ajouter un enfant
      </Link>

      {loading && !data ? (
        <LoadingState compact title="Chargement de vos enfants" description="" />
      ) : error ? (
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: "Retour à l'accueil", href: '/app' }} />
      ) : children.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-night-200 p-6 text-center text-sm text-night-600">
          Aucun enfant pour le moment. Ajoutez votre premier enfant pour commencer.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/enfants/${c.id}`}
                className="flex items-center gap-4 rounded-2xl border border-night-100 bg-white p-4 shadow-[0_1px_2px_rgba(11,45,91,0.06),0_8px_24px_-16px_rgba(11,45,91,0.12)] transition hover:border-night-200 active:scale-[.99] motion-reduce:transition-none"
              >
                <ChildAvatar child={c} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold text-night-900">{c.prenom}</p>
                  <p className="mt-0.5 text-[13px] text-night-600">
                    {childAgeLabel(c)} <span aria-hidden="true">•</span>
                    <span className="sr-only">,</span> {c.classe}
                  </p>
                  <ChildStatusBadge child={c} className="mt-1.5" />
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-night-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
