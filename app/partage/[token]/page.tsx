import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ShareViewer } from '@/components/dossier/share/ShareViewer'

// Page publique (sans compte) : consultation en lecture seule d'un dossier partagé
// par un parent avec son avocat. Jamais indexée, jeton jamais transmis en Referer.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.share')
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: 'no-referrer',
  }
}

export const dynamic = 'force-dynamic'

export default async function PartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ShareViewer token={token} />
}
