'use client'
import { PRICING, type Cycle, type PaidPlan } from './pricing'
import { cn } from '@/lib/cn'

/** Sélecteur Mensuel / Annuel (pastille "-17 %" sur l'annuel). */
export function CycleToggle({ value, onChange, className, plan = 'premium' }: { value: Cycle; onChange: (c: Cycle) => void; className?: string; plan?: PaidPlan }) {
  const p = PRICING[plan]
  const items: { key: Cycle; title: string; sub: string }[] = [
    { key: 'mensuel', title: 'Mensuel', sub: 'Sans engagement' },
    { key: 'annuel', title: 'Annuel', sub: p.freeMonthsLabel },
  ]
  return (
    <div role="radiogroup" aria-label="Fréquence de facturation" className={cn('grid grid-cols-2 gap-3', className)}>
      {items.map(it => {
        const active = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(it.key)}
            onKeyDown={e => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault()
                onChange(value === 'mensuel' ? 'annuel' : 'mensuel')
              }
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              'relative min-h-[56px] rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
              active ? 'border-leaf-500 bg-white shadow-soft' : 'border-night-100 bg-night-50/70 hover:bg-night-50',
            )}
          >
            <span className="block text-[14px] font-bold text-night-900">{it.title}</span>
            <span className="block text-[11.5px] text-night-700">{it.sub}</span>
            {it.key === 'annuel' && (
              <span className="absolute -right-1.5 -top-2.5 rounded-md bg-leaf-700 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                {p.discountLabel}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
