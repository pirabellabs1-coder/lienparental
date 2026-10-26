// Carte de graphique accessible : titre, description textuelle, graphique,
// et tableau de données alternatif repliable (<details>, sans JavaScript).
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'

export type TableSpec = {
  caption: string
  columns: { label: string; numeric?: boolean }[]
  rows: (string | number)[][]
  /** Ligne de total (facultative). */
  footer?: (string | number)[]
}

type Props = {
  id: string
  title: string
  description: string
  table?: TableSpec
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ id, title, description, table, actions, children, className }: Props) {
  const titleId = `${id}-titre`
  const descId = `${id}-desc`
  return (
    <section aria-labelledby={titleId} aria-describedby={descId} className={cn('min-w-0', className)}>
      <Card className="flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-lg font-semibold text-night-900">{title}</h3>
            <p id={descId} className="mt-1 text-sm text-night-600">{description}</p>
          </div>
          {actions}
        </div>
        <div className="flex-1 px-5 py-5">{children}</div>
        {table && <DataTableDetails table={table} />}
      </Card>
    </section>
  )
}

export function DataTableDetails({ table }: { table: TableSpec }) {
  return (
    <details className="group border-t border-night-100">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-b-xl2 px-5 py-2 text-sm font-semibold text-leaf-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-500 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="group-open:hidden">Afficher le tableau de données</span>
          <span className="hidden group-open:inline">Masquer le tableau de données</span>
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="max-h-80 overflow-auto px-5 pb-4" tabIndex={0} role="region" aria-label={table.caption}>
        <table className="w-full text-sm">
          <caption className="sr-only">{table.caption}</caption>
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-night-100 text-left text-xs uppercase tracking-wide text-night-600">
              {table.columns.map((c) => (
                <th key={c.label} scope="col" className={cn('py-2 pr-3 font-semibold', c.numeric && 'text-right')}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-b border-night-50 last:border-0">
                {r.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="py-1.5 pr-3 text-left font-normal text-night-800">{cell}</th>
                  ) : (
                    <td key={j} className={cn('py-1.5 pr-3 tabular-nums text-night-900', table.columns[j]?.numeric && 'text-right')}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
          {table.footer && (
            <tfoot>
              <tr className="border-t border-night-200 font-semibold">
                {table.footer.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="py-1.5 pr-3 text-left text-night-900">{cell}</th>
                  ) : (
                    <td key={j} className={cn('py-1.5 pr-3 tabular-nums text-night-900', table.columns[j]?.numeric && 'text-right')}>{cell}</td>
                  ),
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </details>
  )
}
