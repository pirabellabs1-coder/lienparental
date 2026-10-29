import { getRequestTz } from '@/lib/tz-server'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { MONTHLY_CREDITS, isPaidPlan, parseCycle, type Cycle } from '@/components/profil/pricing'
import { loadBillingPage } from '@/lib/billing/page-state'
import type { BillingView } from '@/lib/billing/types'
import { BILLING_INFO, hasManagedSubscription, paywallReason } from '@/lib/billing/ui-state'
import { billingFormat, type BillingFmt } from './_components/billing-i18n'
import { firstParam } from './_components/BillingNotice'
import { SubscriptionCenter } from './_components/SubscriptionCenter'
import Link from 'next/link'
import { Coins } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { getWallet, type WalletView } from '@/lib/ai/wallet'

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
  const f = billingFormat(t, await getLocale(), await getRequestTz())
  // Raison du paywall traduite (la clé est validée par paywallReason).
  const reasonKey = Array.isArray(sp.raison) ? sp.raison[0] : sp.raison
  const reasonText = reason && reasonKey
    ? { title: t(`paywall.${reasonKey}.title`), text: t(`paywall.${reasonKey}.text`, { free: MONTHLY_CREDITS.gratuit, premium: MONTHLY_CREDITS.premium }) }
    : null
  const focusPlan = isPaidPlan(formule) ? formule : reason?.formule ?? null
  const managed = hasManagedSubscription(view)
  // Cycle présélectionné : celui de l'URL, sinon celui de l'abonnement en cours.
  const initialCycle: Cycle = sp.cycle ? parseCycle(sp.cycle) : managed ? view.cycle : 'mensuel'
  // Crédits IA (soldes A et B) : résumé et lien vers « Mes crédits » (indisponible → bloc masqué).
  const user = await getCurrentUser()
  const wallet: WalletView | null = user ? await getWallet(user).catch(() => null) : null

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
      {wallet && (
        <section aria-labelledby="sub-credits" className="mx-auto w-full max-w-5xl px-4 pb-8">
          <div className="flex flex-col gap-3 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Coins className="mt-0.5 h-5 w-5 shrink-0 text-iris-600" aria-hidden="true" />
              <div>
                <h2 id="sub-credits" className="text-[14px] font-bold text-night-900">{t('credits.title')}</h2>
                <p className="text-[13px] text-night-700">
                  {t('credits.summary', { monthly: wallet.monthly, quota: wallet.monthlyQuota, purchased: wallet.purchased, date: f.date(wallet.periodEnd) })}
                </p>
                <p className="mt-0.5 text-[12px] text-night-600">{t('credits.note')}</p>
              </div>
            </div>
            <Link href="/app/coach/credits" className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-night-200 px-4 text-[14px] font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-500">
              {t('credits.link')}
            </Link>
          </div>
        </section>
      )}
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
