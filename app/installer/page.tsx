import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { CLIENT_NS_SITE_INSTALL } from '@/lib/i18n/client-namespaces'
import { MobileInstall } from '@/components/marketing/MobileInstall'
import { InstallQr } from '@/components/install/InstallQr'
import { getCurrentUser } from '@/lib/auth/session'
import { appUrl } from '@/lib/auth/redirect'
import { pageMetadata } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.install')
  const ts = await getTranslations('seo.pages.installer')
  return pageMetadata({ title: t('metaTitle'), description: ts('description'), path: '/installer', locale: await getLocale() })
}

export default async function InstallerPage() {
  // Démo (cookie lp_demo) ou Supabase : le bouton « Continuer » mène à l'app si une session existe.
  const user = await getCurrentUser().catch(() => null)
  // En-tête et pied de page partagés ; MobileInstall garde son en-tête simplifié de maquette (retour, centre d'aide).
  return (
    <SiteShell ownMain extraNamespaces={CLIENT_NS_SITE_INSTALL}>
      <MobileInstall
        continueHref={user ? '/app' : '/onboarding'}
        qr={<InstallQr url={`${appUrl()}/installer`} size={152} />}
      />
    </SiteShell>
  )
}
