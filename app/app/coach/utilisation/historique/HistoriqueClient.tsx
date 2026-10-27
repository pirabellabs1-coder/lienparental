'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Brain, ListFilter } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ActionSheet } from '@/components/ui'
import { UsageBar } from '@/components/coach/ui'
type LogItem = { id: string; title: string; dateLabel: string; status: string }

// M09 — Coach IA · Historique des analyses du cycle (maquette 12.12.09, page 3).
export function HistoriqueClient({ used, total, log }: { used: number; total: number; log: LogItem[] }) {
  const t = useTranslations('coach.usage.log')
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  // Statuts / titres fournis en français par le serveur : traduits au rendu.
  const isDeleted = (it: LogItem) => it.status === 'Supprimée'
  const statusLabel = (it: LogItem) => (it.status === 'Terminée' ? t('statusDone') : isDeleted(it) ? t('statusDeleted') : it.status)
  const [sortOpen, setSortOpen] = useState(false)
  const items = useMemo(() => (order === 'desc' ? log : [...log].reverse()), [order, log])

  return (
    <>
      <TopBar
        title={t('topTitle')}
        showBack
        backHref="/app/coach/utilisation"
        showBell={false}
        rightSlot={
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            aria-label={t('sort')}
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
            {t('summary')}
          </h2>
          <p className="mt-2 text-[14px] text-night-900">
            <span className="text-[16px] font-extrabold">{used}</span>{t('ofUsed', { total })}
          </p>
          <div className="mt-3">
            <UsageBar used={used} total={total} label={t('quotaUsed')} />
          </div>
          <p className="mt-2.5 text-[12px] text-night-700">{t('pctQuota', { pct: total > 0 ? Math.round((used / total) * 100) : 0 })}</p>
        </section>

        <h2 className="sr-only">{t('listTitle', { order: (order === 'desc' ? t('newestFirst') : t('oldestFirst')).toLocaleLowerCase() })}</h2>
        {items.length === 0 && <p className="mt-6 text-center text-[13px] text-night-600">{t('empty')}</p>}
        <ul className="mt-4 divide-y divide-night-100">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-50" aria-hidden="true">
                <Brain className="h-5 w-5 text-night-700" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-night-900">{isDeleted(it) && it.title === 'Analyse supprimée' ? t('deletedTitle') : it.title}</p>
                <p className="mt-0.5 text-[11.5px] text-night-600">{it.dateLabel}</p>
              </div>
              <span className="shrink-0 rounded-md bg-leaf-50 px-2 py-1 text-[11px] font-semibold text-leaf-700">{statusLabel(it)}</span>
            </li>
          ))}
        </ul>
      </div>

      <ActionSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title={t('sort')}
        actions={[
          { key: 'desc', label: order === 'desc' ? t('checkmark', { label: t('newestFirst') }) : t('newestFirst'), onClick: () => setOrder('desc') },
          { key: 'asc', label: order === 'asc' ? t('checkmark', { label: t('oldestFirst') }) : t('oldestFirst'), onClick: () => setOrder('asc') },
        ]}
      />
    </>
  )
}
