import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { BottomNav } from '@/components/mobile/BottomNav'
import { DesktopSidebar } from '@/components/mobile/DesktopSidebar'
import { SearchProvider } from '@/components/search/SearchProvider'
import { LocaleSync } from '@/components/i18n/LocaleSync'
import { getCurrentUser } from '@/lib/auth/session'
import { getEffectivePlan } from '@/lib/billing/entitlements'
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
  const plan = await sidebarPlan()
  return (
    <div className="min-h-dvh bg-white lg:bg-[#f7f8fc]">
      <DesktopSidebar plan={plan} />
      <div className="md:pl-64 lg:pr-8">
        <main
          className="relative mx-auto min-h-dvh w-full bg-white lg:my-6 lg:ml-8 lg:min-h-[calc(100dvh-3rem)] lg:max-w-[1120px] lg:rounded-3xl lg:px-4 lg:pb-10 lg:shadow-[0_1px_3px_rgba(11,45,91,0.06),0_12px_40px_-20px_rgba(11,45,91,0.18)] lg:ring-1 lg:ring-night-100"
          style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </main>
      </div>
      <div className="md:hidden"><BottomNav /></div>
      <SearchProvider />
      <LocaleSync />
    </div>
  )
}
