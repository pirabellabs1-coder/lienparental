import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { pageMetadata } from '@/lib/seo/metadata'

// La page est un composant client : ses metadata (indexables, canonical) vivent ici.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seo.pages.connexion')
  return pageMetadata({
    title: t('title'),
    description: t('description'),
    path: '/onboarding/connexion',
    locale: await getLocale(),
    robots: { index: true, follow: true },
  })
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
