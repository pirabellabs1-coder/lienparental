import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { BottomNav } from '@/components/mobile/BottomNav'
import { DesktopSidebar } from '@/components/mobile/DesktopSidebar'
import { NavigationProgress } from '@/components/mobile/NavigationProgress'
import { SearchProvider } from '@/components/search/SearchProvider'
import { CoachBubble } from '@/components/assistant/CoachBubble'
import { LocaleSync } from '@/components/i18n/LocaleSync'
import { ScopedIntlProvider } from '@/components/i18n/ScopedIntlProvider'
import { CLIENT_NS_APP } from '@/lib/i18n/client-namespaces'
import { getCurrentUser } from '@/lib/auth/session'
import { getEffectivePlan } from '@/lib/billing/entitlements'
import { getRequestTzInfo } from '@/lib/tz-server'
import { TimeZoneProvider } from '@/components/tz/TimeZoneProvider'
import type { PlanId } from '@/components/profil/pricing'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('meta'))('appTitle') }
}

// Téléphone : plein écran + barre d'onglets (dont « Menu »). Tablette et ordinateur : menu latéral ; colonne centrée dès lg.
/** Plan effectif pour la carte d'abonnement du menu latéral (jamais bloquant : Gratuit en cas d'erreur). */
async function sidebarPlan(): Promise<PlanId> {
  try {
    const user = await getCurrentUser()
    if (!user) return 'gratuit'
    return (await getEffectivePlan(user.id, user.plan)).plan
  } catch {
    return 'gratuit'
  }
}

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [plan, tz] = await Promise.all([sidebarPlan(), getRequestTzInfo()])
  return (
    // Catalogue des modules de l'espace connecté (sans e-mails, erreurs serveur, site public…) : audit C3.
    <ScopedIntlProvider namespaces={CLIENT_NS_APP}>
    {/* Fuseau de l'utilisateur (préférence) : posé avant le rendu des pages (lib/tz → currentTz). */}
    <TimeZoneProvider initialTz={tz.tz} preference={tz.preference}>
    <div className="min-h-dvh bg-white lg:bg-[#f7f8fc]">
      {/* Retour immédiat au clic sur un lien (lit l'URL : useSearchParams, d'où la frontière Suspense). */}
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <DesktopSidebar plan={plan} />
      <div className="md:pl-64 lg:pr-8">
        <main
          className="relative mx-auto min-h-dvh w-full bg-white lg:my-6 lg:ml-8 lg:min-h-[calc(100dvh-3rem)] lg:max-w-[1120px] lg:rounded-3xl lg:px-4 lg:pb-10 lg:shadow-[0_1px_3px_rgba(11,45,91,0.06),0_12px_40px_-20px_rgba(11,45,91,0.18)] lg:ring-1 lg:ring-night-100"
          data-safe-bottom
          style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </main>
      </div>
      <div className="md:hidden"><BottomNav /></div>
      <SearchProvider />
      {/* Bulle du Coach parental (mascotte en bas à droite), au-dessus de la barre d'onglets mobile. */}
      <CoachBubble />
      <LocaleSync />
    </div>
    </TimeZoneProvider>
    </ScopedIntlProvider>
  )
}
