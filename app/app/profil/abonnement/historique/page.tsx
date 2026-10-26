import { TopBar } from '@/components/mobile/TopBar'
import { CrownIcon, ListGroup, ListRow, Pill, SectionTitle, StripeNote } from '@/components/profil/kit'
import { PLAN_NAME, formatPrice, periodFor, planLabel, priceForPlan } from '@/components/profil/pricing'
import { resolvePlan } from '@/components/profil/data'
import { invoices as mockInvoices, subscription as mockSubscription } from '@/components/profil/data'
import { getCurrentUser } from '@/lib/auth/session'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getBillingOverview, mockBillingView } from '@/lib/billing/overview'
import { isUuid } from '@/lib/billing/subscription'
import { STATUS_LABEL, formatCardBrand, formatDateFr, type BillingView } from '@/lib/billing/types'
import { InvoicesList } from './InvoicesList'

export const dynamic = 'force-dynamic'

// Détails de l'abonnement + historique des paiements.
// Réel : résumé lu côté serveur, factures chargées depuis GET /api/stripe/invoices.
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function HistoriquePage({ searchParams }: PageProps) {
  const demoPlan = resolvePlan((await searchParams).plan)
  let view: BillingView = mockBillingView(demoPlan === 'gratuit' ? 'premium' : demoPlan)
  if (BILLING_LIVE) {
    const user = await getCurrentUser()
    view = user && isUuid(user.id) ? await getBillingOverview(user.id) : { ...mockBillingView('gratuit'), live: true, card: null }
  }

  const cycle = view.cycle
  const live = view.live
  const endLabel = live ? formatDateFr(view.periodEnd) : mockSubscription.endsOn
  const nextLabel = live ? formatDateFr(view.periodEnd) : mockSubscription.nextPayment
  const amount = view.amount ?? priceForPlan(view.formule, cycle)
  const statusLabel = view.status ? (view.cancelAtPeriodEnd ? 'Résilié' : STATUS_LABEL[view.status]) : 'Aucun abonnement'
  const backHref = live ? '/app/profil/abonnement' : `/app/profil/abonnement?plan=${view.plan}`
  const card = view.card ? `${formatCardBrand(view.card.brand)} •••• ${view.card.last4}` : '—'

  return (
    <>
      <TopBar title="Détails de l’abonnement" showBack backHref={backHref} showBell={false} />
      <div className="px-5 pb-8 pt-3">
        <div className="flex items-start gap-4 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
          <CrownIcon className="mt-1 h-9 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-bold text-night-900">Lien Parental {PLAN_NAME[view.formule]}</p>
              <Pill tone={view.status === 'active' && !view.cancelAtPeriodEnd ? 'leaf' : 'orange'}>{statusLabel}</Pill>
            </div>
            {view.status && <p className="mt-1 text-[12.5px] text-night-800">Abonnement {cycle}</p>}
            {view.status && (
              <p className="mt-1 text-[12.5px] text-night-800">
                {view.cancelAtPeriodEnd ? `Se termine le ${endLabel}` : `Renouvellement le ${nextLabel}`}
              </p>
            )}
          </div>
        </div>

        {view.status && (
          <>
            <SectionTitle className="mt-6 mb-1">Résumé de l’abonnement</SectionTitle>
            <dl className="divide-y divide-night-100 text-[12.5px]">
              <Row label="Formule" value={planLabel(view.formule, cycle)} />
              <Row label="Prix" value={`${formatPrice(amount)} ${periodFor(cycle)}`} />
              <Row label={view.cancelAtPeriodEnd ? 'Fin des avantages' : 'Prochain prélèvement'} value={view.cancelAtPeriodEnd ? endLabel : nextLabel} />
              <Row label="Moyen de paiement" value={card} />
            </dl>

            {!view.cancelAtPeriodEnd && (
              <ListGroup className="mt-3">
                <ListRow href={live ? '/app/profil/abonnement/changer' : '/app/profil/abonnement/changer?plan=premium'} title={<span className="block text-center text-[13px]">Changer de formule</span>} className="min-h-[48px]" />
              </ListGroup>
            )}
          </>
        )}

        <SectionTitle className="mt-6 mb-1">Historique des paiements</SectionTitle>
        <InvoicesList
          live={live}
          mock={mockInvoices.map(i => ({ id: i.id, date: i.date, amount: i.amount, paid: i.status === 'paye' }))}
        />
        <StripeNote className="mt-5" />
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-night-800">{label}</dt>
      <dd className="text-right text-night-900">{value}</dd>
    </div>
  )
}
