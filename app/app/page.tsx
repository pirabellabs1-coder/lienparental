'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Wallet, Compass, HeartPulse, MessageSquareQuote, MessageCircle, Repeat, FileStack, UsersRound } from 'lucide-react'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { SearchTrigger } from '@/components/search/SearchTrigger'
import { ActiveChildCard } from '@/components/dashboard/ActiveChildCard'
import { CoachQuickAccess } from '@/components/dashboard/CoachQuickAccess'
import { ModelCardsGrid } from '@/components/dashboard/ModelCardsGrid'
import { RecentDocuments } from '@/components/dashboard/RecentDocuments'
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents'
import { TestimonyRequestCard } from '@/components/dashboard/TestimonyRequestCard'
import { DailyTip } from '@/components/dashboard/DailyTip'
import { useRecentVaultDocs, useUpcomingEvents } from '@/components/dashboard/useDashboardData'
import { mockUser, mockModels, mockTips } from '@/lib/mock-data'
import { toModelCard, usePublishedTemplates } from '@/lib/modeles/client'
import { useAccountProfile } from '@/lib/auth/browser'
import { LIVE } from '@/lib/data/core'
import { useChildrenList } from '@/lib/data/children'
import { useUnreadNotificationsCount } from '@/lib/data/notifications'
import { useVaultLockState } from '@/components/vault-lock/useVaultLockState'
import { VaultLockedNotice } from '@/components/vault-lock/VaultLockedNotice'

// Profil de démonstration (renvoyé tel quel sans Supabase par useAccountProfile).
const DEMO_PROFILE = { prenom: mockUser.prenom, nom: mockUser.nom, email: mockUser.email, memberSince: '' }

// M03 — Accueil (maquette 12.12.07 (1)).
// Compte réel : profil, enfants, événements, documents et notifications du compte (RLS) ;
// démonstration : jeux fictifs de lib/mock-data. Le conseil du jour reste éditorial.
export default function DashboardPage() {
  const { profile } = useAccountProfile(DEMO_PROFILE)
  const children = useChildrenList()
  const [selectedChildId, setSelectedChildId] = useState('')
  const childList = children.data ?? []
  const activeChildId = childList.some((c) => c.id === selectedChildId) ? selectedChildId : (childList[0]?.id ?? '')
  const unread = useUnreadNotificationsCount()
  const { data: publishedTemplates, status: templatesStatus } = usePublishedTemplates()
  const { state: vault } = useVaultLockState()
  const events = useUpcomingEvents()
  const recent = useRecentVaultDocs(vault === 'open')
  // Catalogue intégré (générique, non personnel) tant qu'aucun modèle n'est publié.
  const models = publishedTemplates.length ? publishedTemplates.map(toModelCard) : templatesStatus === 'loading' && LIVE ? [] : mockModels

  return (
    <div
      className="w-full space-y-6 px-4 pb-8"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
    >
      {/* Salutation */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[25px] font-extrabold leading-tight tracking-[-0.01em] text-night-900">
            {profile.prenom ? `Bonjour ${profile.prenom}` : 'Bonjour'} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-2 max-w-[230px] text-[14px] leading-relaxed text-night-800">
            Lien Parental vous accompagne au quotidien.
          </p>
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center">
        <SearchTrigger variant="icon" className="lg:hidden" />
        <Link
          href="/app/notifications"
          aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-night-50"
        >
          <Bell className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
          {unread > 0 && (
            <span aria-hidden="true" className="absolute bottom-2.5 right-2.5 h-2.5 w-2.5 rounded-full bg-leaf-500 ring-2 ring-white" />
          )}
        </Link>
        <LogoutButton variant="icon" className="lg:hidden" />
        </div>
      </header>

      <section aria-label="Enfant actif" className="!mt-5">
        {children.loading && !children.data ? (
          <SectionPlaceholder label="Chargement de vos enfants" />
        ) : children.error ? (
          <SectionError message={children.error.message} onRetry={() => void children.refresh()} />
        ) : (
          <ActiveChildCard items={childList} activeId={activeChildId} onChange={setSelectedChildId} />
        )}
      </section>

      <nav aria-label="Organisation" className="!mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/app/guide" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600"><Compass className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="text-[13.5px] font-bold leading-tight text-night-900">Guide Parent Guyane</span>
        </Link>
        <Link href="/app/journal?filtre=finances" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-600"><Wallet className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="text-[13.5px] font-bold leading-tight text-night-900">Dépenses et paiements</span>
        </Link>
        <Link href={activeChildId ? `/app/enfants/${activeChildId}/sante` : '/app/enfants'} className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600"><HeartPulse className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="text-[13.5px] font-bold leading-tight text-night-900">Santé des enfants</span>
        </Link>
        <Link href="/app/coffre/temoignages" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-50 text-night-700"><MessageSquareQuote className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="text-[13.5px] font-bold leading-tight text-night-900">Témoignages</span>
        </Link>
      </nav>

      <nav aria-label="Coparentalité" className="!mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/app/messages" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600"><MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-[13.5px] font-bold leading-tight text-night-900">Messages</span><span className="block text-[12px] text-night-600">Échanger avec l’autre parent</span></span>
        </Link>
        <Link href="/app/garde" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600"><Repeat className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-[13.5px] font-bold leading-tight text-night-900">Planning de garde</span><span className="block text-[12px] text-night-600">Alternance et vacances</span></span>
        </Link>
        <Link href="/app/dossier" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-50 text-night-700"><FileStack className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-[13.5px] font-bold leading-tight text-night-900">Mon dossier JAF</span><span className="block text-[12px] text-night-600">Export PDF et partage avocat</span></span>
        </Link>
              <Link href="/app/coparents" className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-shadow hover:shadow-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600"><UsersRound className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-[13.5px] font-bold leading-tight text-night-900">Parents liés</span><span className="block text-[12px] text-night-600">Inviter l’autre parent, partager</span></span>
        </Link>
</nav>

      <div className="!mt-4">
        <CoachQuickAccess />
      </div>

      <section aria-labelledby="models-title">
        <SectionTitle id="models-title">Documents prêts à l’emploi</SectionTitle>
        {models.length ? <ModelCardsGrid models={models} /> : <SectionPlaceholder label="Chargement des modèles" />}
      </section>

      <div className="space-y-6 border-t border-night-100 pt-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <section aria-labelledby="recent-title">
          <SectionTitle id="recent-title">Mes documents récents</SectionTitle>
          {/* Coffre verrouillé (ou état inconnu) : aucune donnée du coffre, carte explicite. */}
          {vault !== 'open' ? (
            <VaultLockedNotice state={vault} what="vos documents récents" />
          ) : recent.loading ? (
            <SectionPlaceholder label="Chargement de vos documents" />
          ) : recent.error ? (
            <SectionError message={recent.error.message} onRetry={recent.retry} />
          ) : (
            <RecentDocuments docs={recent.data} emptyLabel={LIVE ? 'Aucun document dans votre coffre-fort pour le moment.' : undefined} />
          )}
        </section>

        <section aria-labelledby="events-title">
          <SectionTitle id="events-title">Prochains événements</SectionTitle>
          {events.loading ? (
            <SectionPlaceholder label="Chargement de vos événements" />
          ) : events.error ? (
            <SectionError message={events.error.message} onRetry={events.retry} />
          ) : (
            <UpcomingEvents events={events.data} />
          )}
        </section>
      </div>

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-end lg:gap-6 lg:space-y-0">
        <TestimonyRequestCard />

        <section aria-labelledby="tip-title">
          <SectionTitle id="tip-title">Conseil du jour</SectionTitle>
          <DailyTip tips={mockTips} />
        </section>
      </div>
    </div>
  )
}

/** Emplacement réservé pendant un chargement (évite le décalage de mise en page). */
function SectionPlaceholder({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-[76px] animate-pulse rounded-xl2 border border-night-100 bg-night-50/60 motion-reduce:animate-none">
      <span className="sr-only">{label}</span>
    </div>
  )
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl2 border border-alert-100 bg-alert-50/60 p-4 text-[13px] text-night-900">
      <span className="min-w-0">{message}</span>
      <button type="button" onClick={onRetry} className="min-h-[44px] shrink-0 rounded-lg px-3 font-bold text-leaf-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
        Réessayer
      </button>
    </div>
  )
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-[15px] font-bold text-night-900">
      {children}
    </h2>
  )
}
