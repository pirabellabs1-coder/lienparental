import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { isPaidPlan, parseCycle, type Cycle } from '@/components/profil/pricing'
import { loadBillingPage } from '@/lib/billing/page-state'
import type { BillingView } from '@/lib/billing/types'
import { BILLING_INFO, hasManagedSubscription, paywallReason } from '@/lib/billing/ui-state'
import { billingFormat, type BillingFmt } from './_components/billing-i18n'
import { firstParam } from './_components/BillingNotice'
import { SubscriptionCenter } from './_components/SubscriptionCenter'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.center')
  return { title: t('title') }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * « Mon abonnement » : l'unique écran de l'abonnement.
 *  1. statut actuel (formule, cycle, prix, échéance ou fin d'accès, statut, carte) ;
 *  2. formules avec sélecteur Mensuel / Annuel et UN bouton par formule ;
 *  3. gestion (portail Stripe, résiliation / reprise) et factures.
 *
 * Paramètres : `formule` + `cycle` (présélection depuis la page d'accueil ou un paywall),
 * `raison` (paywall), `info` (retour d'action, dont `portal` = retour du portail Stripe,
 * qui resynchronise l'abonnement), `erreur` (retour 303 d'une route), `section=factures`.
 */
export default async function AbonnementPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const info = firstParam(sp.info)
  const state = await loadBillingPage({ resync: info === 'portal' })
  const { view, mode } = state

  const formule = firstParam(sp.formule)
  const reason = paywallReason(sp.raison)
  const t = await getTranslations('billing')
  const f = billingFormat(t, await getLocale())
  // Raison du paywall traduite (la clé est validée par paywallReason).
  const reasonKey = Array.isArray(sp.raison) ? sp.raison[0] : sp.raison
  const reasonText = reason && reasonKey ? { title: t(`paywall.${reasonKey}.title`), text: t(`paywall.${reasonKey}.text`) } : null
  const focusPlan = isPaidPlan(formule) ? formule : reason?.formule ?? null
  const managed = hasManagedSubscription(view)
  // Cycle présélectionné : celui de l'URL, sinon celui de l'abonnement en cours.
  const initialCycle: Cycle = sp.cycle ? parseCycle(sp.cycle) : managed ? view.cycle : 'mensuel'

  return (
    <>
      <TopBar title={t('center.title')} showBack backHref="/app/profil" showBell={false} />
      <SubscriptionCenter
        mode={mode}
        view={view}
        available={state.available}
        initialCycle={initialCycle}
        focusPlan={focusPlan}
        reason={reasonText}
        info={info && info in BILLING_INFO ? info : null}
        erreur={firstParam(sp.erreur)}
        showInvoices={managed}
        hasCustomer={state.hasCustomer}
        scrollToInvoices={firstParam(sp.section) === 'factures'}
        demoInvoices={mode === 'demo' ? demoInvoices(view, f) : []}
      />
    </>
  )
}

/** Factures fictives cohérentes avec l'abonnement simulé (démonstration). */
function demoInvoices(view: BillingView, f: BillingFmt) {
  if (!view.periodEnd || view.amount === null) return []
  const end = new Date(view.periodEnd)
  return [1, 2, 3].map(i => {
    const d = new Date(end)
    if (view.cycle === 'annuel') d.setUTCFullYear(d.getUTCFullYear() - i)
    else d.setUTCMonth(d.getUTCMonth() - i)
    return { id: `demo_${i}`, date: f.date(d.toISOString()), amount: view.amount ?? 0, paid: true, ts: d.getTime() }
  })
    .filter(inv => inv.ts > Date.now() - 400 * 86_400_000 && inv.ts <= Date.now())
    .slice(0, view.cycle === 'annuel' ? 1 : 3)
    .map(({ ts: _ts, ...inv }) => inv)
}
