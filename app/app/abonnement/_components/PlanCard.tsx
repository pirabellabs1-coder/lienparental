import { Check, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { btn } from '@/components/profil/kit'
import { PLAN_FEATURE_KEYS, PLAN_FEATURES, PRICING, storageGb, type Cycle, type PlanId } from '@/components/profil/pricing'
import type { PlanAction } from '@/lib/billing/ui-state'
import { cn } from '@/lib/cn'
import { billingFormat } from './billing-i18n'

/**
 * Carte d'une formule : prix du cycle choisi, avantages, UN seul bouton.
 * `isOwn` : formule actuellement souscrite (marquée « Votre formule »).
 */
export function PlanCard({
  plan, cycle, action, isOwn, featured, busy, locked = false, onAction,
}: {
  plan: PlanId
  cycle: Cycle
  action: PlanAction
  isOwn: boolean
  featured?: boolean
  busy: boolean
  /** Une autre action est en cours : bouton désactivé (pas de second clic concurrent). */
  locked?: boolean
  onAction: () => void
}) {
  const t = useTranslations('billing')
  const f = billingFormat(t, useLocale())
  const formatPrice = f.price
  const planName = f.plan(plan)
  const titleId = `formule-${plan}`
  const hintId = `formule-${plan}-aide`
  const p = plan === 'gratuit' ? null : PRICING[plan]

  return (
    <li
      aria-labelledby={titleId}
      className={cn(
        'relative flex flex-col rounded-xl2 border bg-white p-4 shadow-soft sm:p-5',
        isOwn ? 'border-2 border-leaf-500' : featured ? 'border-night-200' : 'border-night-100',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-[17px] font-extrabold text-night-900">{planName}</h3>
        {isOwn ? (
          <span className="rounded-full bg-leaf-500 px-2.5 py-1 text-[11.5px] font-bold text-white">{t('planCard.yourPlan')}</span>
        ) : featured ? (
          <span className="rounded-full border border-night-200 bg-night-50 px-2.5 py-1 text-[11.5px] font-bold text-night-900">{t('common.mostChosen')}</span>
        ) : null}
      </div>
      <p className="mt-1 text-[12.5px] text-night-700">{t(`planCard.tagline.${plan}`)}</p>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.01em] text-night-900">
          {p ? formatPrice(cycle === 'annuel' ? p.yearly : p.monthly) : t('common.zeroPrice')}
        </span>
        <span className="text-[13px] font-medium text-night-700">{p ? f.period(cycle) : t('planCard.forever')}</span>
      </p>
      <p className="mt-1.5 min-h-[1.5em] text-[12.5px] text-night-800">
        {p && cycle === 'annuel' ? (
          <>
            {t('planCard.annualEquivalent', { price: formatPrice(p.yearlyPerMonth) })}{' '}
            <strong className="font-bold text-leaf-700">{t('planCard.annualSavings', { amount: formatPrice(p.yearlySavings), promo: f.freeMonths(plan as Exclude<PlanId, 'gratuit'>) })}</strong>
          </>
        ) : p ? (
          <>{t('planCard.monthlyHint', { price: formatPrice(p.yearly), promo: f.freeMonths(plan as Exclude<PlanId, 'gratuit'>) })}</>
        ) : (
          t('planCard.noCard')
        )}
      </p>

      <ul className="mt-4 flex-1 space-y-2 border-t border-night-100 pt-4" aria-label={t('planCard.includedIn', { plan: planName })}>
        {PLAN_FEATURES[plan].map((feature, i) => (
          <li key={feature} className="flex items-start gap-2.5 text-[13px] leading-snug text-night-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" strokeWidth={2.75} aria-hidden />
            {PLAN_FEATURE_KEYS[plan][i] ? t(`features.${plan}.${PLAN_FEATURE_KEYS[plan][i]}`, { gb: storageGb(plan) }) : feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAction}
        disabled={action.disabled || busy || locked}
        aria-busy={busy || undefined}
        aria-describedby={action.hint ? hintId : undefined}
        className={cn(action.primary ? btn.primary : btn.secondary, 'mt-5 px-3 text-[14.5px]', action.disabled && 'disabled:opacity-100 bg-night-50 text-night-700 shadow-none border border-night-200 hover:bg-night-50')}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
        {busy ? t('planCard.wait') : action.label}
        {!busy && <span className="sr-only">{p ? t('planCard.srPaid', { plan: planName, cycle: t(`common.cycleLower.${cycle}`) }) : t('planCard.srFree', { plan: planName })}</span>}
      </button>
      {action.hint && <p id={hintId} className="mt-2 text-center text-[12px] text-night-700">{action.hint}</p>}
    </li>
  )
}
