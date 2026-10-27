'use client'
// Activité dans le temps : messages envoyés, analyses Coach IA, documents
// déposés. Courbes sur un même axe (même unité : nombre d'actions) ; les
// cases à cocher masquent une série pour lire les plus petites à leur échelle.
import { useState } from 'react'
import { ChartCard } from './ChartCard'
import { EmptyChart, LineChart, SeriesToggles, type LineSeries, type VizColor, type XPoint } from './viz'
import { fmtInt } from '@/lib/admin/stats/format'

type Key = 'messages' | 'ai' | 'documents'
export type ActivityRow = Record<Key, number>

const DEFS: { id: Key; label: string; color: VizColor; column: string }[] = [
  { id: 'messages', label: 'Messages envoyés', color: 'blue', column: 'Messages' },
  { id: 'ai', label: 'Analyses Coach IA', color: 'green', column: 'Analyses Coach IA' },
  { id: 'documents', label: 'Documents déposés', color: 'gold', column: 'Documents' },
]

type Props = {
  points: XPoint[]
  rows: ActivityRow[]
  /** Totaux de la période (les lignes peuvent être des moyennes quotidiennes). */
  totals: ActivityRow
  /** Les lignes sont des moyennes par jour sur chaque semaine (évite la chute d'une semaine incomplète). */
  dailyAverage?: boolean
  description: string
  unitLabel: string
  className?: string
}

const fmtAvg = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

export function ActivityChart({ points, rows, totals, dailyAverage = false, description, unitLabel, className }: Props) {
  const [on, setOn] = useState<Record<string, boolean>>({ messages: true, ai: true, documents: true })
  const series: LineSeries[] = DEFS.filter((d) => on[d.id]).map((d) => ({ id: d.id, label: d.label, color: d.color, values: rows.map((r) => r[d.id]) }))
  const empty = DEFS.every((d) => totals[d.id] === 0)
  const cell = dailyAverage ? fmtAvg : fmtInt

  return (
    <ChartCard
      id="activite"
      className={className}
      title="Activité dans le temps"
      description={description}
      table={{
        caption: dailyAverage ? `Activité : moyenne par jour, pour chaque ${unitLabel}` : `Activité par ${unitLabel}`,
        columns: [{ label: 'Date' }, ...DEFS.map((d) => ({ label: dailyAverage ? `${d.column} (par jour)` : d.column, numeric: true }))],
        rows: rows.map((r, i) => [points[i].longLabel, ...DEFS.map((d) => cell(r[d.id]))]),
        footer: ['Total de la période', ...DEFS.map((d) => fmtInt(totals[d.id]))],
      }}
    >
      {empty ? (
        <EmptyChart>Aucune activité enregistrée sur cette période.</EmptyChart>
      ) : (
        <>
          {/* Les cases à cocher servent de légende (trait de couleur + nom). */}
          <div className="mb-3">
            <SeriesToggles
              legend="Séries affichées"
              items={DEFS}
              checked={on}
              onChange={(id, v) => setOn((s) => ({ ...s, [id]: v }))}
            />
          </div>
          <LineChart points={points} series={series} unit="count" summary={`Courbes de l’activité ${dailyAverage ? `en moyenne par jour, pour chaque ${unitLabel}` : `par ${unitLabel}`}. ${description}`} />
          {dailyAverage && <p className="mt-2 text-xs text-night-600">Moyenne par jour sur chaque semaine, pour comparer aussi les semaines incomplètes du début et de la fin de période.</p>}
        </>
      )}
    </ChartCard>
  )
}
