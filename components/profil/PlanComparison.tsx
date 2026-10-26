import { Check, Minus } from 'lucide-react'
import { PLAN_COMPARISON, PLAN_NAME, PRICING, formatPrice, type ComparisonValue, type PlanId } from './pricing'
import { cn } from '@/lib/cn'

/**
 * Tableau comparatif des formules (données : PLAN_COMPARISON). Composant serveur
 * ou client indifféremment (aucun état). `highlight` met une colonne en avant.
 */
export function PlanComparison({
  plans = ['gratuit', 'premium', 'coparentalite'],
  highlight,
  caption = 'Comparatif des formules',
  className,
}: {
  plans?: readonly PlanId[]
  highlight?: PlanId
  caption?: string
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-soft', className)}>
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-night-50/60">
          <tr className="align-bottom text-[11.5px] font-bold text-night-900">
            <th scope="col" className="w-[31%] px-2.5 py-3">Fonctionnalités</th>
            {plans.map(p => (
              <th
                key={p}
                scope="col"
                className={cn('px-1.5 py-3 text-center', highlight === p && 'bg-gold-50 text-night-900')}
              >
                {/* Césure douce : « Coparentalité+ » tient dans une colonne étroite sur mobile. */}
                <span className="block break-words">{p === 'coparentalite' ? 'Coparenta­lité+' : PLAN_NAME[p]}</span>
                <span className="mt-0.5 block text-[10.5px] font-semibold text-night-700">
                  {p === 'gratuit' ? '0 €' : `${formatPrice(PRICING[p].monthly)} / mois`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-night-100">
          {PLAN_COMPARISON.map(row => (
            <tr key={row.label} className="text-[11.5px] text-night-800">
              <th scope="row" className="px-2.5 py-2.5 font-normal leading-snug">{row.label}</th>
              {plans.map(p => (
                <td key={p} className={cn('px-1.5 py-2.5 text-center leading-snug', highlight === p && 'bg-gold-50/60')}>
                  <Cell value={row.values[p]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return <><Check className="mx-auto h-4 w-4 text-leaf-500" strokeWidth={2.75} aria-hidden /><span className="sr-only">Inclus</span></>
  }
  if (value === false) {
    return <><Minus className="mx-auto h-4 w-4 text-night-300" aria-hidden /><span className="sr-only">Non inclus</span></>
  }
  return <span className="font-semibold text-night-900">{value}</span>
}
