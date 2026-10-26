import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/SiteShell'
import { MobileInstall } from '@/components/marketing/MobileInstall'
import { InstallQr } from '@/components/install/InstallQr'
import { getCurrentUser } from '@/lib/auth/session'
import { appUrl } from '@/lib/auth/redirect'

export const metadata: Metadata = {
  title: 'Installer l’application',
  description: 'Ajoutez Lien Parental à l’écran d’accueil de votre iPhone ou de votre téléphone Android, en quelques secondes.',
}

export default async function InstallerPage() {
  // Démo (cookie lp_demo) ou Supabase : le bouton « Continuer » mène à l'app si une session existe.
  const user = await getCurrentUser().catch(() => null)
  // En-tête et pied de page partagés ; MobileInstall garde son en-tête simplifié de maquette (retour, centre d'aide).
  return (
    <SiteShell ownMain>
      <MobileInstall
        continueHref={user ? '/app' : '/onboarding'}
        qr={<InstallQr url={`${appUrl()}/installer`} size={152} />}
      />
    </SiteShell>
  )
}
