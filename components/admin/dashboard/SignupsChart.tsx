'use client'
// Inscriptions par jour / semaine / mois : regroupement côté client
// (série quotidienne déjà chargée), sans nouvel appel serveur.
import { useId, useMemo, useState } from 'react'
import { bucketize, fillDaily } from '@/lib/admin/stats/compute'
import { fmtInt } from '@/lib/admin/stats/format'
import type { DailyPoint, Grain } from '@/lib/admin/stats/types'
import { ChartCard } from './ChartCard'
import { ColumnChart } from './charts'
import { cn } from '@/lib/cn'

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'jour', label: 'Jour' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
]
const UNIT: Record<Grain, string> = { jour: 'jour', semaine: 'semaine', mois: 'mois' }

type Props = { points: DailyPoint[]; fromDay: string; toDay: string; defaultGrain: Grain; periodLabel: string; className?: string }

export function SignupsChart({ points, fromDay, toDay, defaultGrain, periodLabel, className }: Props) {
  const [grain, setGrain] = useState<Grain>(defaultGrain)
  const name = useId()
  const daily = useMemo(() => fillDaily(points, fromDay, toDay), [points, fromDay, toDay])
  const buckets = useMemo(() => bucketize(daily, grain), [daily, grain])
  const total = daily.reduce((s, p) => s + p.value, 0)
  const peak = buckets.reduce<(typeof buckets)[number] | null>((best, b) => (!best || b.value > best.value ? b : best), null)
  const avg = buckets.length ? total / buckets.length : 0

  const description = total === 0
    ? `Aucune inscription ${periodLabel}.`
    : `${fmtInt(total)} inscriptions ${periodLabel}, soit ${avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} en moyenne par ${UNIT[grain]}. Pic : ${fmtInt(peak?.value ?? 0)} (${peak?.longLabel.toLowerCase()}).`

  return (
    <ChartCard
      id="inscriptions"
      className={className}
      title="Inscriptions"
      description={description}
      actions={
        <fieldset className="flex rounded-xl border border-night-200 bg-white p-0.5">
          <legend className="sr-only">Regrouper les inscriptions par</legend>
          {GRAINS.map((g) => (
            <label key={g.value} className="relative">
              <input
                type="radio"
                name={name}
                value={g.value}
                checked={grain === g.value}
                onChange={() => setGrain(g.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'inline-flex min-h-11 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-[0.6rem] px-3 text-sm font-semibold transition-colors motion-reduce:transition-none',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-1',
                  grain === g.value ? 'bg-night-900 text-white' : 'text-night-700 hover:bg-night-50',
                )}
              >
                {g.label}
              </span>
            </label>
          ))}
        </fieldset>
      }
      table={{
        caption: `Inscriptions par ${UNIT[grain]}`,
        columns: [{ label: grain === 'jour' ? 'Jour' : grain === 'semaine' ? 'Semaine' : 'Mois' }, { label: 'Inscriptions', numeric: true }],
        rows: buckets.map((b) => [b.longLabel, fmtInt(b.value)]),
        footer: ['Total', fmtInt(total)],
      }}
    >
      {total === 0 ? (
        <p className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-night-200 text-sm text-night-600">
          Aucune inscription sur cette période.
        </p>
      ) : (
        <ColumnChart
          data={buckets.map((b) => ({ key: b.key, label: b.label, longLabel: b.longLabel, values: [b.value] }))}
          series={[{ label: 'Inscriptions', color: 'leaf' }]}
          summary={`Histogramme des inscriptions par ${UNIT[grain]}. ${description}`}
          format={fmtInt}
        />
      )}
    </ChartCard>
  )
}
