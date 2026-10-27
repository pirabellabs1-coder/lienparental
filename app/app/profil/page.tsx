import { resolvePlan, subscription, usage } from '@/components/profil/data'
import { GO } from '@/components/profil/storage'
import { loadProfileUsage } from '@/components/profil/usage-server'
import { getDemoBilling } from '@/lib/billing/demo'
import { demoBillingView, demoPeriodEnd } from '@/lib/billing/demo-core'
import { describeStatus } from '@/lib/billing/ui-state'
import { formatDateFr } from '@/lib/billing/types'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { ProfilView, type ProfilViewProps } from './ProfilView'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// M11 — Mon profil.
// Compte réel : formule effective, espace utilisé (documents du coffre) et quota du Coach
// lus côté serveur (components/profil/usage-server) ; `?plan=` est ignoré.
// Démonstration : abonnement simulé (Mon abonnement, cookie lp_demo_billing) ;
// `?plan=premium` / `?plan=coparentalite` / `?plan=gratuit` force un aperçu.
const statusOf = (s: ReturnType<typeof describeStatus>) => ({ label: s.label, headline: s.headline, tone: s.tone })

export default async function ProfilPage({ searchParams }: PageProps) {
  if (!SUPABASE_ENABLED) {
    const forced = (await searchParams).plan
    const demo = forced ? null : await getDemoBilling()
    const plan = demo ? demo.plan : resolvePlan(forced)
    const u = usage[plan]
    return (
      <ProfilView
        live={false}
        plan={plan}
        storage={{ usedBytes: u.storageUsed * GO, maxBytes: u.storageMax * GO }}
        coach={{ used: u.coachUsed, quota: u.coachMax }}
        status={demo && demo.plan !== 'gratuit' ? statusOf(describeStatus(demoBillingView(demo))) : null}
        subscriptionDate={
          demo && demo.plan !== 'gratuit'
            ? { label: demo.cancelAtPeriodEnd ? 'Se termine le' : 'Renouvellement le', date: formatDateFr(demoPeriodEnd(demo)) }
            : { label: 'Se termine le', date: subscription.endsOn }
        }
      />
    )
  }

  const data = await loadProfileUsage()
  const props: ProfilViewProps = data
    ? {
        live: true,
        plan: data.plan,
        storage: data.storage && { usedBytes: data.storage.usedBytes, maxBytes: data.storage.maxBytes },
        coach: data.coach,
        status: data.subscription?.status ?? null,
        subscriptionDate: data.subscription?.periodEnd
          ? { label: data.subscription.cancelAtPeriodEnd ? 'Se termine le' : 'Renouvellement le', date: formatDateFr(data.subscription.periodEnd) }
          : null,
      }
    : // Session illisible (le middleware redirige normalement avant) : aucune valeur inventée.
      { live: true, plan: 'gratuit', storage: null, coach: null, subscriptionDate: null }
  return <ProfilView {...props} />
}
