import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { PartnerShowcase } from '@/components/partenaires/PartnerShowcase'
import { pageMetadata } from '@/lib/seo/metadata'

// Langue lue dans un cookie (comme les autres pages publiques) : rendu à chaque requête.
export const dynamic = 'force-dynamic'

const PATH = '/partenaires'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.partners.page')
  return pageMetadata({ title: t('metaTitle'), description: t('metaDescription'), path: PATH, locale: await getLocale() })
}

/** Page publique des partenaires : même vitrine que l'accueil (trois familles de partenaires, puis l'appel à candidature). */
export default async function PartnersPage() {
  return (
    <SiteShell mainClassName="bg-[#F7F9FC]">
      <PartnerShowcase as="h1" />
    </SiteShell>
  )
}
