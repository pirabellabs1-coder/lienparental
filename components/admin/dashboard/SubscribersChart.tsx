'use client'
// Abonnés payants dans le temps : aires empilées, par formule (Premium /
// Coparentalité+) ou par cycle de facturation (mensuel / annuel).
import { useState } from 'react'
import { fmtInt } from '@/lib/admin/stats/format'
import { ChartCard } from './ChartCard'
import { EmptyChart, LineChart, Segmented, VizLegend, type LineSeries, type XPoint } from './viz'

type Mode = 'formule' | 'cycle'
export type SubsRow = { premiumMonthly: number; premiumYearly: number; coparentaliteMonthly: number; coparentaliteYearly: number }

type Props = { id?: string; points: XPoint[]; rows: SubsRow[]; startTotal: number; periodLabel: string; className?: string }

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtInt(Math.abs(n))}`

export function SubscribersChart({ id = 'abonnes', points, rows, startTotal, periodLabel, className }: Props) {
  const [mode, setMode] = useState<Mode>('formule')
  const premium = rows.map((r) => r.premiumMonthly + r.premiumYearly)
  const copa = rows.map((r) => r.coparentaliteMonthly + r.coparentaliteYearly)
  const monthly = rows.map((r) => r.premiumMonthly + r.coparentaliteMonthly)
  const yearly = rows.map((r) => r.premiumYearly + r.coparentaliteYearly)
  const last = rows.length - 1
  const total = last >= 0 ? premium[last] + copa[last] : 0
  const lastLabel = points[last]?.longLabel.toLowerCase() ?? ''

  const series: LineSeries[] = mode === 'formule'
    ? [
        { id: 'premium', label: 'Premium', color: 'blue', values: premium },
        { id: 'copa', label: 'Coparentalité+', color: 'green', values: copa },
      ]
    : [
        { id: 'mensuel', label: 'Mensuel', color: 'blue', values: monthly },
        { id: 'annuel', label: 'Annuel', color: 'gold', values: yearly },
      ]

  const split = mode === 'formule'
    ? `${fmtInt(premium[last] ?? 0)} en Premium et ${fmtInt(copa[last] ?? 0)} en Coparentalité+`
    : `${fmtInt(monthly[last] ?? 0)} au mois et ${fmtInt(yearly[last] ?? 0)} à l’année`
  const description = rows.length === 0
    ? `Aucune donnée d’abonnement ${periodLabel}.`
    : `${fmtInt(total)} abonnés payants en fin de période (${lastLabel}), ${signed(total - startTotal)} ${periodLabel} : ${split}.`

  return (
    <ChartCard
      id={id}
      className={className}
      title="Abonnés payants"
      description={description}
      actions={
        <Segmented
          legend="Répartir les abonnés par"
          value={mode}
          onChange={setMode}
          options={[{ value: 'formule', label: 'Formule' }, { value: 'cycle', label: 'Cycle' }]}
        />
      }
      note="Abonnés en fin de journée, toutes formules payantes. Les jours passés sont reconstitués à partir des dates d’abonnement et de résiliation."
      table={{
        caption: 'Abonnés payants en fin de période, par formule et cycle',
        columns: [{ label: 'Date' }, { label: 'Premium mensuel', numeric: true }, { label: 'Premium annuel', numeric: true }, { label: 'Coparentalité+ mensuel', numeric: true }, { label: 'Coparentalité+ annuel', numeric: true }, { label: 'Total', numeric: true }],
        rows: rows.map((r, i) => [points[i].longLabel, fmtInt(r.premiumMonthly), fmtInt(r.premiumYearly), fmtInt(r.coparentaliteMonthly), fmtInt(r.coparentaliteYearly), fmtInt(premium[i] + copa[i])]),
      }}
    >
      {rows.length === 0 ? (
        <EmptyChart>Aucun abonnement sur cette période.</EmptyChart>
      ) : (
        <>
          <VizLegend className="mb-3" items={series.map((s) => ({ label: s.label, color: s.color, kind: 'area' }))} />
          <LineChart points={points} series={series} unit="count" stacked totalLabel="Total abonnés" summary={`Aires empilées des abonnés payants. ${description}`} />
        </>
      )}
    </ChartCard>
  )
}
