import { resolvePlan, subscription, usage } from '@/components/profil/data'
import { GO } from '@/components/profil/storage'
import { loadProfileUsage } from '@/components/profil/usage-server'
import { getDemoBilling } from '@/lib/billing/demo'
import { demoBillingView, demoPeriodEnd } from '@/lib/billing/demo-core'
import { describeStatus } from '@/lib/billing/ui-state'
import type { BillingView } from '@/lib/billing/types'
import { getLocale, getTranslations } from 'next-intl/server'
import { billingFormat, localizeStatus, type BillingFmt } from '@/app/app/abonnement/_components/billing-i18n'
import { intlLocale } from '@/lib/i18n/config'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { ProfilView, type ProfilViewProps } from './ProfilView'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// M11 — Mon profil.
// Compte réel : formule effective, espace utilisé (documents du coffre) et quota du Coach
// lus côté serveur (components/profil/usage-server) ; `?plan=` est ignoré.
// Démonstration : abonnement simulé (Mon abonnement, cookie lp_demo_billing) ;
// `?plan=premium` / `?plan=coparentalite` / `?plan=gratuit` force un aperçu.
// Libellé et phrase traduits (miroir de describeStatus côté « Mon abonnement ») ; le ton reste celui de describeStatus.
const statusOf = (v: BillingView, f: BillingFmt) => {
  const s = localizeStatus(v, f)
  return { label: s.label, headline: s.headline, tone: describeStatus(v).tone }
}

export default async function ProfilPage({ searchParams }: PageProps) {
  const t = await getTranslations('account.profile.home')
  const locale = await getLocale()
  const bf = billingFormat(await getTranslations('billing'), locale)
  // Même rendu que formatDateFr (date longue, fuseau Guyane), dans la langue de l’utilisateur.
  const formatDate = (iso: string | null | undefined) => {
    const d = iso ? new Date(iso) : null
    if (!d || Number.isNaN(d.getTime())) return t('unknownDate')
    return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: 'America/Cayenne' }).format(d)
  }
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
        status={demo && demo.plan !== 'gratuit' ? statusOf(demoBillingView(demo), bf) : null}
        subscriptionDate={
          demo && demo.plan !== 'gratuit'
            ? { label: demo.cancelAtPeriodEnd ? t('endsOn') : t('renewsOn'), date: formatDate(demoPeriodEnd(demo)) }
            : { label: t('endsOn'), date: subscription.endsOn }
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
          ? { label: data.subscription.cancelAtPeriodEnd ? t('endsOn') : t('renewsOn'), date: formatDate(data.subscription.periodEnd) }
          : null,
      }
    : // Session illisible (le middleware redirige normalement avant) : aucune valeur inventée.
      { live: true, plan: 'gratuit', storage: null, coach: null, subscriptionDate: null }
  return <ProfilView {...props} />
}
