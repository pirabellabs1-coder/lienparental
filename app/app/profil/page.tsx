import { resolvePlan, subscription, usage } from '@/components/profil/data'
import { GO } from '@/components/profil/storage'
import { loadProfileUsage } from '@/components/profil/usage-server'
import { formatDateFr } from '@/lib/billing/types'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { ProfilView, type ProfilViewProps } from './ProfilView'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// M11 — Mon profil.
// Compte réel : formule effective, espace utilisé (documents du coffre) et quota du Coach
// lus côté serveur (components/profil/usage-server) ; `?plan=` est ignoré.
// Démonstration : `?plan=premium` / `?plan=coparentalite` / `?plan=gratuit` pour prévisualiser.
export default async function ProfilPage({ searchParams }: PageProps) {
  if (!SUPABASE_ENABLED) {
    const plan = resolvePlan((await searchParams).plan)
    const u = usage[plan]
    return (
      <ProfilView
        live={false}
        plan={plan}
        storage={{ usedBytes: u.storageUsed * GO, maxBytes: u.storageMax * GO }}
        coach={{ used: u.coachUsed, quota: u.coachMax }}
        subscriptionDate={{ label: 'Se termine le', date: subscription.endsOn }}
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
        subscriptionDate: data.subscription?.periodEnd
          ? { label: data.subscription.cancelAtPeriodEnd ? 'Se termine le' : 'Renouvellement le', date: formatDateFr(data.subscription.periodEnd) }
          : null,
      }
    : // Session illisible (le middleware redirige normalement avant) : aucune valeur inventée.
      { live: true, plan: 'gratuit', storage: null, coach: null, subscriptionDate: null }
  return <ProfilView {...props} />
}
