// Graphiques SVG faits main, sans dépendance. Composants sans état ni hook :
// utilisables depuis un Server Component comme depuis un Client Component.
//
// Principe de rendu responsive : la zone de tracé est un SVG étiré
// (preserveAspectRatio="none", aucun texte dedans) ; les axes et légendes
// sont en HTML, donc lisibles à toute largeur. Chaque barre porte un <title>
// (infobulle au survol) ; l'accès clavier / lecteur d'écran passe par le
// résumé aria-label du SVG et par le tableau de données de ChartCard.
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// --- Échelle --------------------------------------------------------------

/** Maximum « rond » et graduations (0 inclus) pour un axe vertical. */
export function niceScale(max: number, ticks = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 100) / 100)
  return { max: top, ticks: out }
}

// --- Palette (contraste ≥ 3:1 sur blanc pour les objets graphiques) ----------

export type SeriesColor = 'leaf' | 'night' | 'gold' | 'goldDark' | 'iris' | 'slate'

const FILL: Record<SeriesColor, string> = {
  leaf: 'fill-leaf-500',
  night: 'fill-night-800',
  gold: 'fill-gold-500',
  goldDark: 'fill-gold-700',
  iris: 'fill-iris-500',
  slate: 'fill-night-400',
}
const STROKE: Record<SeriesColor, string> = {
  leaf: 'stroke-leaf-500',
  night: 'stroke-night-800',
  gold: 'stroke-gold-500',
  goldDark: 'stroke-gold-700',
  iris: 'stroke-iris-500',
  slate: 'stroke-night-400',
}
const BG: Record<SeriesColor, string> = {
  leaf: 'bg-leaf-500',
  night: 'bg-night-800',
  gold: 'bg-gold-500',
  goldDark: 'bg-gold-700',
  iris: 'bg-iris-500',
  slate: 'bg-night-400',
}

export function Legend({ items }: { items: { label: string; color: SeriesColor; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-night-700" aria-label="Légende">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', BG[i.color])} aria-hidden="true" />
          <span>{i.label}</span>
          {i.value && <span className="font-semibold text-night-900">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

// --- Histogramme vertical (simple ou empilé) ---------------------------------

export type ColumnDatum = { key: string; label: string; longLabel: string; values: number[] }

type ColumnChartProps = {
  data: ColumnDatum[]
  series: { label: string; color: SeriesColor }[]
  /** Résumé textuel lu par les lecteurs d'écran. */
  summary: string
  format: (n: number) => string
  formatAxis?: (n: number) => string
  height?: number
}

export function ColumnChart({ data, series, summary, format, formatAxis = format, height = 220 }: ColumnChartProps) {
  const totals = data.map((d) => d.values.reduce((s, v) => s + v, 0))
  const scale = niceScale(Math.max(0, ...totals))
  const n = Math.max(1, data.length)
  const W = n * 10
  const barW = n > 60 ? 8.6 : n > 20 ? 7.6 : 6.4
  const pad = (10 - barW) / 2
  // Libellés : ~6 sur mobile, ~12 au-delà ; le pas mobile est un multiple du pas large.
  const wide = Math.max(1, Math.ceil(n / 12))
  const narrow = wide * Math.max(1, Math.ceil(n / 6 / wide))

  return (
    <div className="w-full">
      <div className="flex">
        <div className="relative w-14 shrink-0 text-right text-[11px] tabular-nums text-night-600" style={{ height }} aria-hidden="true">
          {scale.ticks.map((t) => (
            <span key={t} className="absolute right-2 whitespace-nowrap" style={{ bottom: `${(t / scale.max) * 100}%`, transform: 'translateY(50%)' }}>
              {formatAxis(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {scale.ticks.map((t) => (
            <div key={t} className={cn('absolute inset-x-0 border-t', t === 0 ? 'border-night-300' : 'border-dashed border-night-100')} style={{ bottom: `${(t / scale.max) * 100}%` }} aria-hidden="true" />
          ))}
          <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={summary}>
            {data.map((d, i) => {
              let acc = 0
              const tip = `${d.longLabel} : ${series.length > 1 ? d.values.map((v, s) => `${series[s].label} ${format(v)}`).join(', ') + `, total ${format(totals[i])}` : format(d.values[0] ?? 0)}`
              return (
                <g key={d.key} className="transition-opacity hover:opacity-75 motion-reduce:transition-none">
                  <title>{tip}</title>
                  {/* zone de survol pleine hauteur, pour les petites barres */}
                  <rect x={i * 10} y={0} width={10} height={100} fill="transparent" />
                  {d.values.map((v, s) => {
                    const h = (v / scale.max) * 100
                    const y = 100 - acc - h
                    acc += h
                    if (h <= 0) return null
                    return <rect key={s} x={i * 10 + pad} y={y} width={barW} height={h} className={cn(FILL[series[s].color], 'stroke-white')} strokeWidth={series.length > 1 ? 0.4 : 0} vectorEffect="non-scaling-stroke" />
                  })}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      <div className="relative ml-14 h-5 text-[11px] text-night-600" aria-hidden="true">
        {data.map((d, i) =>
          i % wide === 0 ? (
            <span
              key={d.key}
              className={cn('absolute top-1 -translate-x-1/2 whitespace-nowrap', i % narrow !== 0 && 'hidden sm:inline')}
              style={{ left: `${((i + 0.5) / n) * 100}%` }}
            >
              {d.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}

// --- Barres horizontales -----------------------------------------------------

type HBarRow = { key: string; label: string; value: number; previous?: number; detail?: string }

export function HBarList({
  rows,
  color = 'leaf',
  format,
  summary,
  previousLabel,
}: {
  rows: HBarRow[]
  color?: SeriesColor
  format: (n: number) => string
  summary: string
  previousLabel?: string
}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.previous ?? 0)))
  return (
    <div role="img" aria-label={summary}>
      <ul className="space-y-3" aria-hidden="true">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-night-800" title={r.label}>{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-night-900">{format(r.value)}</span>
            </div>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-1 h-2.5 w-full overflow-visible">
              <rect x={0} y={0} width={100} height={10} className="fill-night-50" />
              <rect x={0} y={0} width={(r.value / max) * 100} height={10} className={FILL[color]} />
            </svg>
            {r.previous != null && (
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-0.5 h-1 w-full">
                <rect x={0} y={0} width={(r.previous / max) * 100} height={10} className="fill-night-300" />
              </svg>
            )}
            {r.detail && <p className="mt-0.5 text-xs text-night-600">{r.detail}</p>}
          </li>
        ))}
      </ul>
      {previousLabel && rows.some((r) => r.previous != null) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-night-600" aria-hidden="true">
          <span className="inline-block h-1 w-4 rounded bg-night-300" /> {previousLabel}
        </p>
      )}
    </div>
  )
}

// --- Anneau (répartition) ----------------------------------------------------

export function Donut({
  parts,
  summary,
  center,
}: {
  parts: { label: string; value: number; color: SeriesColor }[]
  summary: string
  center?: ReactNode
}) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const R = 40
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={summary}>
        <circle cx={50} cy={50} r={R} fill="none" strokeWidth={14} className="stroke-night-50" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * C
            const el = (
              <circle
                key={p.label}
                cx={50}
                cy={50}
                r={R}
                fill="none"
                strokeWidth={14}
                strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? 0.8 : 0))} ${C}`}
                strokeDashoffset={-offset}
                className={STROKE[p.color]}
              >
                <title>{`${p.label} : ${p.value.toLocaleString('fr-FR')} (${((p.value / total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`}</title>
              </circle>
            )
            offset += len
            return el
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">{center}</div>}
    </div>
  )
}

// --- Entonnoir -----------------------------------------------------------------

export function Funnel({
  steps,
  summary,
}: {
  steps: { id: string; label: string; count: number | null }[]
  summary: string
}) {
  const base = steps.find((s) => s.count != null && s.count > 0)?.count ?? 1
  return (
    <div role="img" aria-label={summary}>
    <ol className="space-y-3" aria-hidden="true">
      {steps.map((s, i) => {
        const prev = steps.slice(0, i).reverse().find((p) => p.count != null)
        const rate = s.count != null && prev?.count ? (s.count / prev.count) * 100 : null
        const width = s.count != null ? Math.max(2, (s.count / base) * 100) : 0
        return (
          <li key={s.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-night-800">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-night-100 text-[11px] font-semibold text-night-800">{i + 1}</span>
                {s.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-night-900">
                {s.count != null ? s.count.toLocaleString('fr-FR') : 'Non mesuré'}
              </span>
            </div>
            {s.count != null ? (
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-1 h-4 w-full">
                <rect x={0} y={0} width={100} height={10} className="fill-night-50" />
                <rect x={(100 - width) / 2} y={0} width={width} height={10} className={i === steps.length - 1 ? 'fill-gold-500' : 'fill-leaf-500'} />
              </svg>
            ) : (
              <div className="mt-1 h-4 w-full rounded border border-dashed border-night-200" />
            )}
            {rate != null && (
              <p className="mt-0.5 text-xs text-night-600">
                {rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % de l’étape précédente
              </p>
            )}
          </li>
        )
      })}
    </ol>
    </div>
  )
}
