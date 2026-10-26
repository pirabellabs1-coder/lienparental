import type { Metadata } from 'next'
import { OfflineState } from '@/components/mobile/StateScreens'

export const metadata: Metadata = {
  title: 'Hors connexion — Lien Parental',
  description: 'Vous êtes hors connexion. Vérifiez votre connexion et réessayez.',
  robots: { index: false, follow: false },
}

// Page servie par le service worker quand la navigation échoue hors ligne (maquette « Hors connexion »).
export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex h-14 items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <p className="text-[17px] font-bold text-night-900">Hors connexion</p>
        </header>
        <main>
          <OfflineState
            headingLevel={1}
            primary={{ label: 'Réessayer', reload: true }}
            secondary={{ label: 'Travailler hors ligne', back: true, href: '/' }}
          />
        </main>
      </div>
    </div>
  )
}
