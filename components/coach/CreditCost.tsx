'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Coins } from 'lucide-react'
import type { CreditAction } from '@/lib/ai/credit-config'
import { cn } from '@/lib/cn'

export type CreditsSnapshot = {
  monthly: number
  purchased: number
  total: number
  costs: Partial<Record<CreditAction, number>>
  confirmFrom: number
}

/** Soldes et coûts (GET /api/coach/credits). null : indisponible (le serveur tranchera à l'appel). */
export function useCredits(): { data: CreditsSnapshot | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<CreditsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fetch('/api/coach/credits', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d as CreditsSnapshot | null))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tick])
  const refresh = useCallback(() => setTick((n) => n + 1), [])
  return { data, loading, refresh }
}

/**
 * Coût affiché AVANT une action IA (cahier V6) + confirmation explicite si coût ≥ seuil (3) +
 * blocage avec packs proposés si le solde est insuffisant. La saisie reste conservée (brouillon
 * de session) : le parent revient ici après l'achat. Le serveur revérifie tout à l'appel.
 */
export function CreditCost({
  action,
  credits,
  confirmed,
  onConfirmedChange,
  className,
}: {
  action: CreditAction
  credits: CreditsSnapshot | null
  confirmed: boolean
  onConfirmedChange: (v: boolean) => void
  className?: string
}) {
  const t = useTranslations('coach.cost')
  const id = useId()
  if (!credits) return null
  const cost = credits.costs[action]
  if (cost === undefined) {
    return <p role="alert" className={cn('rounded-xl2 border border-alert-200 bg-alert-50 p-3 text-[12.5px] text-night-900', className)}>{t('inactive')}</p>
  }
  const enough = credits.total >= cost
  return (
    <section aria-label={t('label')} className={cn('rounded-xl2 border border-night-100 bg-white p-4 text-[13px] text-night-900 shadow-soft', className)}>
      <p className="flex items-center gap-2 font-semibold">
        <Coins className="h-4 w-4 shrink-0 text-iris-600" aria-hidden="true" />
        {t('cost', { count: cost })}
      </p>
      <p className="mt-1 text-[12.5px] text-night-700">{t('balance', { total: credits.total, monthly: credits.monthly, purchased: credits.purchased })}</p>
      {!enough ? (
        <div role="alert" className="mt-3 rounded-lg bg-alert-50 p-3 text-[12.5px] leading-relaxed">
          <p>{t('insufficient', { missing: cost - credits.total })}</p>
          <Link href="/app/coach/credits#packs" className="mt-2 inline-block font-semibold underline underline-offset-2">
            {t('buy')}
          </Link>
          <p className="mt-1 text-night-700">{t('kept')}</p>
        </div>
      ) : cost >= credits.confirmFrom ? (
        <label htmlFor={id} className="mt-3 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed">
          <input id={id} type="checkbox" checked={confirmed} onChange={(e) => onConfirmedChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-iris-500" />
          <span>{t('confirm', { count: cost })}</span>
        </label>
      ) : null}
    </section>
  )
}

/** État dérivé pour activer / désactiver le bouton de lancement. */
export function costState(action: CreditAction, credits: CreditsSnapshot | null, confirmed: boolean): { blocked: boolean } {
  if (!credits) return { blocked: false } // inconnu : le serveur tranchera (402 si insuffisant)
  const cost = credits.costs[action]
  if (cost === undefined) return { blocked: true }
  if (credits.total < cost) return { blocked: true }
  return { blocked: cost >= credits.confirmFrom && !confirmed }
}
