'use client'
import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { CrownIcon } from './kit'
import { PRICING, formatPriceIn, planPromo, type Cycle, type PaidPlan } from './pricing'
import { intlLocale } from '@/lib/i18n/config'
import { cn } from '@/lib/cn'

/** Carte radio "Premium mensuel / annuel", "Coparentalité+ mensuel / annuel" (Abonnement étape 1 & Changer de formule). */
export function PlanRadioCard({
  cycle,
  plan = 'premium',
  checked,
  onChange,
  name = 'formule',
  current,
}: {
  cycle: Cycle
  /** Formule payante (Premium par défaut). */
  plan?: PaidPlan
  checked: boolean
  onChange: (c: Cycle) => void
  name?: string
  /** Formule actuellement souscrite (affiche "Formule actuelle"). */
  current?: boolean
}) {
  const t = useTranslations('billing')
  const loc = intlLocale(useLocale())
  const formatPrice = (v: number) => formatPriceIn(v, loc)
  const annual = cycle === 'annuel'
  const p = PRICING[plan]
  return (
    <label
      className={cn(
        'relative flex cursor-pointer items-start gap-3.5 rounded-xl2 border p-4 transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-300',
        checked ? 'border-orange-300 bg-orange-50/60 shadow-soft' : 'border-night-100 bg-white hover:border-night-200',
      )}
    >
      <input type="radio" name={name} value={`${plan}:${cycle}`} checked={checked} onChange={() => onChange(cycle)} className="sr-only" />
      <CrownIcon className="mt-3 h-8 w-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-night-900">{t(`common.offer.${cycle}`, { plan: t(`common.plan.${plan}`) })}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[15px] font-bold text-night-900">
            {t('common.pricePeriod', { price: formatPrice(annual ? p.yearly : p.monthly), period: t(`common.period.${cycle}`) })}
          </span>
          {annual && <span className="rounded-md bg-leaf-50 px-2 py-0.5 text-[11px] font-bold text-leaf-700">{t('common.saveDiscount', { pct: planPromo(plan).discountPct })}</span>}
        </span>
        {annual ? (
          <>
            <span className="mt-1.5 block text-[12px] text-night-600 line-through">
              <span className="sr-only">{t('radioCard.referencePrice')}</span>{t('common.perYear', { price: formatPrice(p.yearlyReference) })}
            </span>
            <span className="mt-1 block text-[12px] text-night-800">{t('radioCard.perMonthEquivalent', { price: formatPrice(p.yearlyPerMonth) })}</span>
          </>
        ) : (
          <span className="mt-1.5 block text-[12px] text-night-800">{t('common.noCommitment')}</span>
        )}
        {current && <span className="mt-2 inline-block rounded-md bg-night-100 px-2 py-0.5 text-[11px] font-bold text-night-900">{t('radioCard.currentPlan')}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-orange-400 bg-orange-400 text-white' : 'border-night-200 bg-white',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </label>
  )
}
