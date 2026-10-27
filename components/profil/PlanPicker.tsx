'use client'
import { useLocale, useTranslations } from 'next-intl'
import { PRICING, formatPriceIn, type PaidPlan } from './pricing'
import { intlLocale } from '@/lib/i18n/config'
import { cn } from '@/lib/cn'

const ORDER: readonly PaidPlan[] = ['premium', 'coparentalite']

/**
 * Sélecteur de formule payante (Premium / Coparentalité+), groupe radio
 * accessible : flèches pour changer, une seule tabulation.
 */
export function PlanPicker({
  value, onChange, className, label,
}: {
  value: PaidPlan
  onChange: (p: PaidPlan) => void
  className?: string
  label?: string
}) {
  const t = useTranslations('billing')
  const loc = intlLocale(useLocale())
  return (
    <div role="radiogroup" aria-label={label ?? t('planPicker.label')} className={cn('grid grid-cols-2 gap-3', className)}>
      {ORDER.map(p => {
        const active = value === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(p)}
            onKeyDown={e => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault()
                const next = value === 'premium' ? 'coparentalite' : 'premium'
                onChange(next)
                const sib = (e.currentTarget.parentElement?.querySelector(`[data-plan="${next}"]`) as HTMLButtonElement | null)
                sib?.focus()
              }
            }}
            data-plan={p}
            className={cn(
              'relative min-h-[64px] rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
              active
                ? p === 'coparentalite' ? 'border-night-900 bg-night-900 text-white shadow-soft' : 'border-gold-300 bg-gold-50 text-night-900 shadow-soft'
                : 'border-night-100 bg-white text-night-900 hover:bg-night-50',
            )}
          >
            <span className="block text-[14px] font-bold">{t(`common.plan.${p}`)}</span>
            <span className={cn('block text-[11.5px]', active && p === 'coparentalite' ? 'text-white/85' : 'text-night-700')}>
              {t('planPicker.from', { sub: t(`planPicker.sub.${p}`), price: formatPriceIn(PRICING[p].yearlyPerMonth, loc) })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
