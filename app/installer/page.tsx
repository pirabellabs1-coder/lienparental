import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { MobileInstall } from '@/components/marketing/MobileInstall'
import { InstallQr } from '@/components/install/InstallQr'
import { getCurrentUser } from '@/lib/auth/session'
import { appUrl } from '@/lib/auth/redirect'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.install')
  return { title: t('metaTitle'), description: t('metaDescription') }
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
