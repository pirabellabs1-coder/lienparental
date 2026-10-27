import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { getCurrentUser } from '@/lib/auth/session'
import { parseCheckoutSessionId, type CheckoutReturnState } from '@/lib/billing/checkout-core'
import { syncFromCheckoutSession } from '@/lib/billing/checkout-return'
import { BILLING_LIVE } from '@/lib/billing/config'
import { DEMO_BILLING, getDemoBilling } from '@/lib/billing/demo'
import { isUuid } from '@/lib/billing/subscription'
import { ConfirmationView } from './ConfirmationView'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.confirmation')
  return { title: t('metaTitle') }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Retour de Stripe Checkout (success_url = /app/abonnement/confirmation?session_id=cs_…).
 * 1. Côté serveur, dès l'arrivée : la session est relue chez Stripe, son appartenance
 *    au compte est vérifiée, et l'abonnement est synchronisé (même code que le webhook).
 * 2. Si l'abonnement n'est pas encore actif (banque, webhook en retard), l'écran
 *    interroge GET /api/stripe/status jusqu'à l'activation, avec un délai maximal.
 * Démonstration (`?demo=1`) : abonnement simulé, aucun paiement.
 */
export default async function ConfirmationPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const t = await getTranslations('billing.confirmation')

  if (DEMO_BILLING) {
    const demo = await getDemoBilling()
    const initial: CheckoutReturnState = demo && demo.plan !== 'gratuit' ? { state: 'active', plan: demo.plan } : { state: 'not_found' }
    return (
      <>
        <TopBar title={t('topBar')} showBell={false} />
        <ConfirmationView mode="demo" sessionId={null} initial={initial} />
      </>
    )
  }

  const sessionId = parseCheckoutSessionId(sp.session_id)
  let initial: CheckoutReturnState = { state: 'not_found' }
  if (BILLING_LIVE && sessionId) {
    const user = await getCurrentUser()
    if (user && isUuid(user.id)) {
      try {
        initial = await syncFromCheckoutSession(user.id, sessionId)
      } catch (err) {
        // Stripe momentanément injoignable : l'écran réessaie via /api/stripe/status.
        console.error('[billing] confirmation : synchronisation différée', err instanceof Error ? err.message : 'unknown')
        initial = { state: 'pending' }
      }
    }
  }

  return (
    <>
      <TopBar title={t('topBar')} showBell={false} />
      <ConfirmationView mode={BILLING_LIVE ? 'live' : 'unavailable'} sessionId={sessionId} initial={initial} />
    </>
  )
}
