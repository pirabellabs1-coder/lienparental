import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OfflineState } from '@/components/mobile/StateScreens'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.offline')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  }
}

// Page servie par le service worker quand la navigation échoue hors ligne (maquette « Hors connexion »).
export default async function OfflinePage() {
  const t = await getTranslations('public.offline')
  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex h-14 items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <p className="text-[17px] font-bold text-night-900">{t('title')}</p>
        </header>
        <main>
          <OfflineState
            headingLevel={1}
            primary={{ label: t('retry'), reload: true }}
            secondary={{ label: t('workOffline'), back: true, href: '/' }}
          />
        </main>
      </div>
    </div>
  )
}
