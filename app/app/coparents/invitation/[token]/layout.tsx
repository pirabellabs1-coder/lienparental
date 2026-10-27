import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'

// Le jeton figure dans l'URL : jamais transmis en Referer, jamais indexé.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('family.coparents.invitationPage')
  return {
    title: t('title'),
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
  }
}

export default function InvitationLayout({ children }: { children: ReactNode }) {
  return children
}
