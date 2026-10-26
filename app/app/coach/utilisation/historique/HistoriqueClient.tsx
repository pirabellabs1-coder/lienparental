'use client'

import { useMemo, useState } from 'react'
import { Brain, ListFilter } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ActionSheet } from '@/components/ui'
import { UsageBar } from '@/components/coach/ui'
type LogItem = { id: string; title: string; dateLabel: string; status: string }

// M09 — Coach IA · Historique des analyses du cycle (maquette 12.12.09, page 3).
export function HistoriqueClient({ used, total, log }: { used: number; total: number; log: LogItem[] }) {
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [sortOpen, setSortOpen] = useState(false)
  const items = useMemo(() => (order === 'desc' ? log : [...log].reverse()), [order, log])

  return (
    <>
      <TopBar
        title="Historique des analyses"
        showBack
        backHref="/app/coach/utilisation"
        showBell={false}
        rightSlot={
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            aria-label="Trier les analyses"
            aria-haspopup="dialog"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <ListFilter className="h-5 w-5" aria-hidden="true" />
          </button>
        }
      />

      <div className="w-full px-4 pb-8 pt-3">
        <section aria-labelledby="cycle-summary" className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
          <h2 id="cycle-summary" className="text-[12.5px] font-bold text-night-900">
            Résumé du cycle actuel
          </h2>
          <p className="mt-2 text-[14px] text-night-900">
            <span className="text-[16px] font-extrabold">{used}</span> / {total} analyses utilisées
          </p>
          <div className="mt-3">
            <UsageBar used={used} total={total} label="Quota utilisé ce cycle" />
          </div>
          <p className="mt-2.5 text-[12px] text-night-700">{total > 0 ? Math.round((used / total) * 100) : 0}% du quota utilisé</p>
        </section>

        <h2 className="sr-only">Analyses du cycle ({order === 'desc' ? 'plus récentes d’abord' : 'plus anciennes d’abord'})</h2>
        {items.length === 0 && <p className="mt-6 text-center text-[13px] text-night-600">Aucune analyse sur ce cycle.</p>}
        <ul className="mt-4 divide-y divide-night-100">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-50" aria-hidden="true">
                <Brain className="h-5 w-5 text-night-700" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-night-900">{it.title}</p>
                <p className="mt-0.5 text-[11.5px] text-night-600">{it.dateLabel}</p>
              </div>
              <span className="shrink-0 rounded-md bg-leaf-50 px-2 py-1 text-[11px] font-semibold text-leaf-700">{it.status}</span>
            </li>
          ))}
        </ul>
      </div>

      <ActionSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Trier les analyses"
        actions={[
          { key: 'desc', label: `Plus récentes d’abord${order === 'desc' ? ' ✓' : ''}`, onClick: () => setOrder('desc') },
          { key: 'asc', label: `Plus anciennes d’abord${order === 'asc' ? ' ✓' : ''}`, onClick: () => setOrder('asc') },
        ]}
      />
    </>
  )
}
