import { resolvePlan } from '@/components/profil/data'
import { getCurrentUser } from '@/lib/auth/session'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getEffectivePlan } from '@/lib/billing/entitlements'
import { getBillingOverview, mockBillingView } from '@/lib/billing/overview'
import { isUuid } from '@/lib/billing/subscription'
import type { BillingView } from '@/lib/billing/types'
import { firstParam } from '@/app/app/premium/_components/BillingNotice'
import { AbonnementView } from './AbonnementView'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Statuts pour lesquels on affiche « Mon abonnement » (sinon : choix de l'offre). */
const MANAGED = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

// Gratuit → étape 1 "Choix de l'offre" ; abonné → "Mon abonnement".
// Facturation réelle (Stripe + Supabase) : données lues côté serveur.
// Démonstration : `?plan=premium` / `?plan=coparentalite` / `?plan=gratuit` pour prévisualiser,
// `?acces=famille` pour l'aperçu « Premium offert par un parent lié ».
export default async function AbonnementPage({ searchParams }: PageProps) {
  const sp = await searchParams

  let view: BillingView
  if (BILLING_LIVE) {
    const user = await getCurrentUser()
    if (user && isUuid(user.id)) {
      const [overview, effective] = await Promise.all([getBillingOverview(user.id), getEffectivePlan(user.id, 'gratuit')])
      view = { ...overview, sharedPremium: overview.plan === 'gratuit' && effective.via === 'famille' }
    } else {
      view = { ...mockBillingView('gratuit'), live: true, card: null }
    }
  } else {
    view = mockBillingView(resolvePlan(sp.plan))
    if (view.plan === 'gratuit' && firstParam(sp.acces) === 'famille') view = { ...view, sharedPremium: true }
  }

  const managed = view.status !== null && MANAGED.has(view.status)
  return (
    <AbonnementView
      view={view}
      managed={managed}
      erreur={firstParam(sp.erreur)}
      formule={firstParam(sp.formule)}
    />
  )
}
