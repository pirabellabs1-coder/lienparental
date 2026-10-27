import { AlertTriangle, CalendarDays, CheckCircle2, Clock, CreditCard, Euro, Info, RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { CrownIcon } from '@/components/profil/kit'
import { priceForPlan } from '@/components/profil/pricing'
import type { BillingView } from '@/lib/billing/types'
import { TONE_BADGE, hasManagedSubscription, type StatusSummary, type StatusTone } from '@/lib/billing/ui-state'
import { cn } from '@/lib/cn'
import { billingFormat } from './billing-i18n'
import { CardValue } from './CardValue'

const TONE_ICON: Record<StatusTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: Clock,
  danger: AlertTriangle,
  neutral: Info,
}

/**
 * Résumé en tête de « Mon abonnement » : formule, cycle, prix, échéance ou fin
 * d'accès, statut et moyen de paiement. L'action éventuelle (paiement en échec,
 * reprise) est fournie par l'écran parent (`action`).
 */
export function StatusCard({ view, status, action }: { view: BillingView; status: StatusSummary; action?: React.ReactNode }) {
  const t = useTranslations('billing')
  const f = billingFormat(t, useLocale())
  const managed = hasManagedSubscription(view)
  const Icon = TONE_ICON[status.tone]
  const amount = view.amount ?? priceForPlan(view.formule, view.cycle)

  return (
    <section
      aria-labelledby="statut-titre"
      className={cn(
        'rounded-xl2 border bg-white p-4 shadow-soft sm:p-5',
        status.tone === 'danger' ? 'border-alert-200' : status.tone === 'warning' ? 'border-gold-200' : 'border-night-100',
      )}
    >
      <div className="flex items-start gap-3.5">
        {managed || view.sharedPremium
          ? <CrownIcon className="mt-0.5 h-9 w-11 shrink-0" />
          : <CrownIcon variant="outline" className="mt-0.5 h-9 w-11 shrink-0 text-night-900" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-night-700">{t('status.yourPlan')}</p>
          <h2 id="statut-titre" className="mt-0.5 text-[18px] font-extrabold leading-tight text-night-900">
            {managed ? f.plan(view.formule) : view.sharedPremium ? t('status.sharedPremium') : f.plan('gratuit')}
          </h2>
          <p className="mt-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold', TONE_BADGE[status.tone])}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span><span className="sr-only">{t('status.statusSr')}</span>{status.label}</span>
            </span>
          </p>
        </div>
      </div>

      <p className="mt-3 text-[14px] font-semibold text-night-900">{status.headline}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-night-800">{status.detail}</p>

      {managed && (
        <dl className="mt-4 divide-y divide-night-100 rounded-xl border border-night-100">
          <Row icon={<CrownIcon variant="outline" className="h-4 w-5 text-night-900" />} label={t('status.rowPlan')} value={f.offer(view.formule, view.cycle)} />
          <Row icon={<Euro className="h-4 w-4" />} label={t('status.rowPrice')} value={f.pricePeriod(amount, view.cycle)} />
          {status.dateLabel && status.date && (
            <Row icon={<CalendarDays className="h-4 w-4" />} label={status.dateLabel} value={f.date(status.date)} />
          )}
          {view.pending && (
            <Row icon={<RotateCcw className="h-4 w-4" />} label={t('status.rowPending')} value={f.offer(view.pending.plan, view.pending.cycle)} />
          )}
          <Row icon={<CreditCard className="h-4 w-4" />} label={t('status.rowPayment')} value={<CardValue card={view.card} />} />
        </dl>
      )}

      {action && <div className="mt-4">{action}</div>}
    </section>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 px-3 py-2">
      <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-night-800">{icon}</span>
      <dt className="min-w-0 flex-1 text-[13px] text-night-800">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-night-900">{value}</dd>
    </div>
  )
}
