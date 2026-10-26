import { resolvePlan, subscription as mockSubscription } from '@/components/profil/data'
import { parsePaidPlan } from '@/components/profil/pricing'
import { getCurrentUser } from '@/lib/auth/session'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getBillingOverview } from '@/lib/billing/overview'
import { isUuid } from '@/lib/billing/subscription'
import { formatDateFr } from '@/lib/billing/types'
import { firstParam } from '@/app/app/premium/_components/BillingNotice'
import { ChangerView } from './ChangerView'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// `?formule=coparentalite` présélectionne Coparentalité+ (lien « Passer à Coparentalité+ »).
// Démonstration : `?plan=premium|coparentalite` fixe la formule actuelle simulée.
export default async function ChangerFormulePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const erreur = firstParam(sp.erreur)
  const initialPlan = firstParam(sp.formule) ? parsePaidPlan(sp.formule) : null

  if (!BILLING_LIVE) {
    const demo = resolvePlan(sp.plan)
    return (
      <ChangerView
        live={false}
        current={{ plan: demo === 'coparentalite' ? 'coparentalite' : 'premium', cycle: mockSubscription.cycle }}
        pending={null}
        initialPlan={initialPlan}
        effectiveLabel={mockSubscription.nextPayment}
        erreur={erreur}
      />
    )
  }

  const user = await getCurrentUser()
  const view = user && isUuid(user.id) ? await getBillingOverview(user.id) : null
  return (
    <ChangerView
      live
      current={{ plan: view?.formule ?? 'premium', cycle: view?.cycle ?? 'mensuel' }}
      pending={view?.pending ?? null}
      initialPlan={initialPlan}
      effectiveLabel={formatDateFr(view?.periodEnd)}
      erreur={erreur ?? (view && view.plan !== 'gratuit' ? null : 'no_subscription')}
    />
  )
}
