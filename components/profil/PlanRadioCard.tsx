'use client'
import { Check } from 'lucide-react'
import { CrownIcon } from './kit'
import { PRICING, formatPrice, planLabel, type Cycle, type PaidPlan } from './pricing'
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
        <span className="block text-[14px] font-bold text-night-900">{planLabel(plan, cycle)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[15px] font-bold text-night-900">
            {formatPrice(annual ? p.yearly : p.monthly)} / {annual ? 'an' : 'mois'}
          </span>
          {annual && <span className="rounded-md bg-leaf-50 px-2 py-0.5 text-[11px] font-bold text-leaf-700">{p.discountShortLabel}</span>}
        </span>
        {annual ? (
          <>
            <span className="mt-1.5 block text-[12px] text-night-600 line-through">
              <span className="sr-only">Prix de référence : </span>{formatPrice(p.yearlyReference)} / an
            </span>
            <span className="mt-1 block text-[12px] text-night-800">Soit {formatPrice(p.yearlyPerMonth)} / mois</span>
          </>
        ) : (
          <span className="mt-1.5 block text-[12px] text-night-800">Sans engagement</span>
        )}
        {current && <span className="mt-2 inline-block rounded-md bg-night-100 px-2 py-0.5 text-[11px] font-bold text-night-900">Formule actuelle</span>}
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
