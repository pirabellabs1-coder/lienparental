import { Check, Loader2 } from 'lucide-react'
import { btn } from '@/components/profil/kit'
import { PLAN_FEATURES, PLAN_NAME, PRICING, formatPrice, type Cycle, type PlanId } from '@/components/profil/pricing'
import type { PlanAction } from '@/lib/billing/ui-state'
import { cn } from '@/lib/cn'

const TAGLINE: Record<PlanId, string> = {
  gratuit: 'Pour bien commencer',
  premium: 'Toutes les fonctionnalités pour un parent',
  coparentalite: 'Premium pour toute la famille liée',
}

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
        <h3 id={titleId} className="text-[17px] font-extrabold text-night-900">{PLAN_NAME[plan]}</h3>
        {isOwn ? (
          <span className="rounded-full bg-leaf-500 px-2.5 py-1 text-[11.5px] font-bold text-white">Votre formule</span>
        ) : featured ? (
          <span className="rounded-full border border-night-200 bg-night-50 px-2.5 py-1 text-[11.5px] font-bold text-night-900">Le plus choisi</span>
        ) : null}
      </div>
      <p className="mt-1 text-[12.5px] text-night-700">{TAGLINE[plan]}</p>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.01em] text-night-900">
          {p ? formatPrice(cycle === 'annuel' ? p.yearly : p.monthly) : '0 €'}
        </span>
        <span className="text-[13px] font-medium text-night-700">{p ? (cycle === 'annuel' ? '/ an' : '/ mois') : 'pour toujours'}</span>
      </p>
      <p className="mt-1.5 min-h-[1.5em] text-[12.5px] text-night-800">
        {p && cycle === 'annuel' ? (
          <>
            Soit {formatPrice(p.yearlyPerMonth)} / mois.{' '}
            <strong className="font-bold text-leaf-700">Économie de {formatPrice(p.yearlySavings)} par an ({p.freeMonthsLabel})</strong>
          </>
        ) : p ? (
          <>Ou {formatPrice(p.yearly)} / an en annuel, {p.freeMonthsLabel}</>
        ) : (
          'Sans carte bancaire'
        )}
      </p>

      <ul className="mt-4 flex-1 space-y-2 border-t border-night-100 pt-4" aria-label={`Inclus dans ${PLAN_NAME[plan]}`}>
        {PLAN_FEATURES[plan].map(f => (
          <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-night-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" strokeWidth={2.75} aria-hidden />
            {f}
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
        {busy ? 'Un instant…' : action.label}
        {!busy && <span className="sr-only">{` : ${PLAN_NAME[plan]}${p ? (cycle === 'annuel' ? ' annuel' : ' mensuel') : ''}`}</span>}
      </button>
      {action.hint && <p id={hintId} className="mt-2 text-center text-[12px] text-night-700">{action.hint}</p>}
    </li>
  )
}
