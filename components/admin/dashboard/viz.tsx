'use client'
// Graphiques interactifs du tableau de bord (courbes, aires empilées, barres
// divergentes) : SVG fait main, sans dépendance.
//
// * Zone de tracé : SVG étiré (preserveAspectRatio="none", aucun texte dedans,
//   traits à épaisseur constante via vector-effect) ; axes, points, réticule
//   et infobulle en HTML, donc nets et lisibles à toute largeur.
// * Survol : un réticule vertical se cale sur le point le plus proche et
//   l'infobulle liste toutes les séries à cette date.
// * Clavier : la zone de tracé est focalisable ; flèches gauche / droite,
//   Début / Fin parcourent les points, annoncés par une région aria-live.
//   Le tableau de données de ChartCard reste l'équivalent complet.
// * Pas d'animation : rien à neutraliser pour prefers-reduced-motion.
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { fmtValue } from '@/lib/admin/stats/format'
import type { KpiUnit } from '@/lib/admin/stats/types'
import { cn } from '@/lib/cn'
import { niceScale } from './charts'

/**
 * Palette catégorielle des séries (ordre fixe, validée par le script dataviz :
 * bande de luminosité, chroma, séparation daltonisme ≥ 8 entre voisines,
 * contraste ≥ 3:1 sur blanc). La couleur suit la série, jamais son rang.
 */
export const VIZ = {
  blue: '#2b5fb4',
  green: '#2e7d32',
  gold: '#c98410',
  violet: '#8a3fc7',
  /** Série de comparaison (période précédente) : gris de mise en retrait. */
  muted: '#8794a8',
} as const
export type VizColor = keyof typeof VIZ

export type XPoint = { key: string; label: string; longLabel: string }

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

/** Graduations : nombres compacts (1,2 k), euros, pourcentages. */
export function axisFormat(unit: KpiUnit): (n: number) => string {
  if (unit === 'eur') return (n) => (n >= 1000 ? `${compact.format(n)} €` : `${n.toLocaleString('fr-FR')} €`)
  if (unit === 'pct') return (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
  return (n) => (n >= 1000 ? compact.format(n) : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))
}

const fmt = (unit: KpiUnit) => (n: number | null) => (n == null ? 'Non disponible' : fmtValue(n, unit))

// --- Légende ---------------------------------------------------------------------

export type LegendItem = { label: string; color: VizColor; kind?: 'line' | 'area' | 'bar' }

/** Légende : trait pour une courbe, pavé pour une aire ou une barre. Le texte garde la couleur du texte. */
export function VizLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-night-700', className)} aria-label="Légende">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === 'line' ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: VIZ[i.color] }} aria-hidden="true" />
          ) : (
            <span className="h-3 w-3 rounded-sm" style={{ background: VIZ[i.color] }} aria-hidden="true" />
          )}
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

// --- Parcours au pointeur et au clavier ---------------------------------------------

function useScrubber(n: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState<number | null>(null)
  const [kbd, setKbd] = useState(false)
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i))
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.width === 0 || n === 0) return
    const t = (e.clientX - r.left) / r.width
    setIdx(clamp(n === 1 ? 0 : Math.round(t * (n - 1))))
    setKbd(false)
  }
  const handlers = {
    ref,
    tabIndex: 0,
    onPointerMove: fromPointer,
    onPointerDown: fromPointer,
    onPointerLeave: () => { if (!kbd) setIdx(null) },
    onFocus: () => { if (n === 0) return; setKbd(true); setIdx((i) => i ?? n - 1) },
    onBlur: () => { setKbd(false); setIdx(null) },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (n === 0) return
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (step) { e.preventDefault(); setKbd(true); setIdx((i) => clamp((i ?? n - 1) + step)) }
      else if (e.key === 'Home') { e.preventDefault(); setKbd(true); setIdx(0) }
      else if (e.key === 'End') { e.preventDefault(); setKbd(true); setIdx(n - 1) }
      else if (e.key === 'Escape') { setIdx(null) }
    },
  }
  return { idx, kbd, handlers }
}

type TipRow = { label: string; value: string; color: VizColor; kind?: 'line' | 'bar' }

/** Infobulle : la valeur d'abord (forte), le nom de série ensuite ; clé en trait de couleur. */
function Tooltip({ x, title, rows, footer }: { x: number; title: string; rows: TipRow[]; footer?: string }) {
  const shift = x < 22 ? '0%' : x > 78 ? '-100%' : '-50%'
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[9.5rem] max-w-[16rem] rounded-xl border border-night-100 bg-white px-3 py-2 text-xs shadow-soft"
      style={{ left: `${x}%`, transform: `translateX(${shift})` }}
      aria-hidden="true"
    >
      <p className="mb-1 font-semibold text-night-700">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className={cn('shrink-0 rounded-full', r.kind === 'bar' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3')} style={{ background: VIZ[r.color] }} />
            <span className="font-semibold tabular-nums text-night-900">{r.value}</span>
            <span className="truncate text-night-600">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1 border-t border-night-100 pt-1 font-semibold text-night-800">{footer}</p>}
    </div>
  )
}

function YAxis({ ticks, max, format, height, mirror = false }: { ticks: number[]; max: number; format: (n: number) => string; height: number; mirror?: boolean }) {
  const pos = (t: number, sign: 1 | -1) => (mirror ? 50 + sign * (t / max) * 50 : (t / max) * 100)
  return (
    <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-night-600 sm:w-14" style={{ height }} aria-hidden="true">
      {ticks.map((t) => (
        <span key={`u${t}`} className="absolute right-2 whitespace-nowrap" style={{ bottom: `${pos(t, 1)}%`, transform: 'translateY(50%)' }}>{format(t)}</span>
      ))}
      {mirror && ticks.filter((t) => t > 0).map((t) => (
        <span key={`d${t}`} className="absolute right-2 whitespace-nowrap" style={{ bottom: `${pos(t, -1)}%`, transform: 'translateY(50%)' }}>{format(t)}</span>
      ))}
    </div>
  )
}

function Grid({ ticks, max, mirror = false }: { ticks: number[]; max: number; mirror?: boolean }) {
  const lines = mirror ? [...ticks.map((t) => 50 + (t / max) * 50), ...ticks.filter((t) => t > 0).map((t) => 50 - (t / max) * 50)] : ticks.map((t) => (t / max) * 100)
  const base = mirror ? 50 : 0
  return (
    <>
      {lines.map((b) => (
        <div key={b} className={cn('absolute inset-x-0 border-t', b === base ? 'border-night-300' : 'border-night-100')} style={{ bottom: `${b}%` }} aria-hidden="true" />
      ))}
    </>
  )
}

/** Libellés de l'axe horizontal : ~4 sur mobile, ~8 au-delà ; premier et dernier calés aux bords. */
function XAxis({ points, x, slots = 7 }: { points: XPoint[]; x: (i: number) => number; slots?: number }) {
  const n = points.length
  const wide = Math.max(1, Math.ceil(n / slots))
  const narrow = wide * Math.max(1, Math.ceil(n / (slots / 2) / wide))
  return (
    <div className="relative ml-12 h-5 text-[11px] text-night-600 sm:ml-14" aria-hidden="true">
      {points.map((p, i) => {
        if (i % wide !== 0) return null
        const left = x(i)
        const shift = n === 1 ? '-50%' : left <= 2 ? '0%' : left >= 98 ? '-100%' : '-50%'
        return (
          <span key={p.key} className={cn('absolute top-1 whitespace-nowrap', i % narrow !== 0 && 'hidden sm:inline')} style={{ left: `${left}%`, transform: `translateX(${shift})` }}>
            {p.label}
          </span>
        )
      })}
    </div>
  )
}

const KEY_HINT = 'Flèches gauche et droite pour parcourir les valeurs.'

// --- Courbes et aires ----------------------------------------------------------------------

export type LineSeries = {
  id: string
  label: string
  color: VizColor
  values: (number | null)[]
  /** line (défaut) ; area : courbe + voile à 10 % ; muted : comparaison grisée, sans point final. */
  kind?: 'line' | 'area' | 'muted'
}

type LineChartProps = {
  points: XPoint[]
  series: LineSeries[]
  unit: KpiUnit
  /** Résumé textuel lu par les lecteurs d'écran (même phrase que la description de la carte). */
  summary: string
  /** Aires empilées (les valeurs s'additionnent) ; l'infobulle affiche aussi le total. */
  stacked?: boolean
  totalLabel?: string
  height?: number
}

function segments(vals: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = ''
  let open = false
  vals.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { open = false; return }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(3)},${(100 - y(v)).toFixed(3)}`
    open = true
  })
  return d
}

export function LineChart({ points, series, unit, summary, stacked = false, totalLabel = 'Total', height = 220 }: LineChartProps) {
  const n = points.length
  const { idx, kbd, handlers } = useScrubber(n)
  const liveId = useId()
  const f = fmt(unit)

  // Empilement : bornes basse / haute de chaque couche.
  const lower: number[][] = []
  const upper: number[][] = []
  if (stacked) {
    const acc = new Array(n).fill(0)
    for (const s of series) {
      lower.push([...acc])
      s.values.forEach((v, i) => { acc[i] += v ?? 0 })
      upper.push([...acc])
    }
  }
  const tops = stacked ? upper[upper.length - 1] ?? [] : series.flatMap((s) => s.values.filter((v): v is number => v != null))
  const scale = niceScale(Math.max(0, ...tops), 4, unit === 'count')
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => (Math.max(0, v) / scale.max) * 100
  const lastIdx = (vals: (number | null)[]) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1 }

  // Infobulle : séries principales d'abord, comparaison grisée en dernier.
  const ordered = [...series.filter((s) => s.kind !== 'muted'), ...series.filter((s) => s.kind === 'muted')]
  const tipRows: TipRow[] = idx == null ? [] : ordered.map((s) => ({ label: s.label, value: f(s.values[idx] ?? null), color: s.kind === 'muted' ? 'muted' : s.color }))
  const total = idx != null && stacked ? series.reduce((sum, s) => sum + (s.values[idx] ?? 0), 0) : null
  const live = idx != null && kbd ? `${points[idx].longLabel} : ${tipRows.map((r) => `${r.label} ${r.value}`).join(', ')}${total != null ? `, ${totalLabel.toLowerCase()} ${f(total)}` : ''}.` : ''

  return (
    <div className="w-full">
      <div className="flex">
        <YAxis ticks={scale.ticks} max={scale.max} format={axisFormat(unit)} height={height} />
        <div
          {...handlers}
          role="group"
          aria-label={`${summary} ${KEY_HINT}`}
          aria-describedby={liveId}
          className="relative min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2"
          style={{ height }}
        >
          <Grid ticks={scale.ticks} max={scale.max} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {stacked
              ? series.map((s, k) => {
                  const top = upper[k].map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(3)},${(100 - y(v)).toFixed(3)}`).join('')
                  const bottom = lower[k].map((v, i) => `L${x(i).toFixed(3)},${(100 - y(v)).toFixed(3)}`).reverse().join('')
                  return (
                    <g key={s.id}>
                      <path d={`${top}${bottom}Z`} fill={VIZ[s.color]} fillOpacity={0.22} stroke="none" />
                      <path d={top} fill="none" stroke={VIZ[s.color]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </g>
                  )
                })
              : series.map((s) => {
                  const d = segments(s.values, x, y)
                  const li = lastIdx(s.values)
                  const first = s.values.findIndex((v) => v != null)
                  return (
                    <g key={s.id}>
                      {s.kind === 'area' && first >= 0 && li >= 0 && (
                        <path d={`${d}L${x(li).toFixed(3)},100L${x(first).toFixed(3)},100Z`} fill={VIZ[s.color]} fillOpacity={0.1} stroke="none" />
                      )}
                      <path
                        d={d}
                        fill="none"
                        stroke={VIZ[s.kind === 'muted' ? 'muted' : s.color]}
                        strokeWidth={s.kind === 'muted' ? 1.5 : 2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  )
                })}
          </svg>

          {/* Points finaux (hors survol) ou points au réticule. */}
          {series.map((s, k) => {
            if (s.kind === 'muted' && idx == null) return null
            const i = idx ?? lastIdx(s.values)
            const v = stacked ? upper[k]?.[i] : s.values[i]
            if (i < 0 || v == null) return null
            return (
              <span
                key={s.id}
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ left: `${x(i)}%`, bottom: `${y(v)}%`, background: VIZ[s.kind === 'muted' ? 'muted' : s.color] }}
                aria-hidden="true"
              />
            )
          })}

          {idx != null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-night-300" style={{ left: `${x(idx)}%` }} aria-hidden="true" />
              <Tooltip x={x(idx)} title={points[idx].longLabel} rows={tipRows} footer={total != null ? `${totalLabel} : ${f(total)}` : undefined} />
            </>
          )}
          <span id={liveId} className="sr-only" aria-live="polite">{live}</span>
        </div>
      </div>
      <XAxis points={points} x={x} />
    </div>
  )
}

// --- Barres divergentes (flux entrant / sortant) ---------------------------------------------

type DivergingProps = {
  points: XPoint[]
  up: { label: string; color: VizColor; values: number[] }
  down: { label: string; color: VizColor; values: number[] }
  unit: KpiUnit
  summary: string
  /** Ligne nette dans l'infobulle (ex. « Solde »). */
  netLabel?: string
  height?: number
}

/** Barres au-dessus (entrées) et au-dessous (sorties) d'une même ligne zéro, même échelle des deux côtés. */
export function DivergingBars({ points, up, down, unit, summary, netLabel = 'Solde', height = 200 }: DivergingProps) {
  const n = points.length
  const { idx, kbd, handlers } = useScrubber(n)
  const liveId = useId()
  const f = fmt(unit)
  const scale = niceScale(Math.max(0, ...up.values, ...down.values), 4, unit === 'count')
  const h = (v: number) => (Math.max(0, v) / scale.max) * 50
  const x = (i: number) => ((i + 0.5) / Math.max(1, n)) * 100
  const net = (i: number) => (up.values[i] ?? 0) - (down.values[i] ?? 0)
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`
  const tipRows: TipRow[] = idx == null ? [] : [
    { label: up.label, value: f(up.values[idx] ?? 0), color: up.color, kind: 'bar' },
    { label: down.label, value: f(down.values[idx] ?? 0), color: down.color, kind: 'bar' },
  ]
  const live = idx != null && kbd ? `${points[idx].longLabel} : ${tipRows.map((r) => `${r.label} ${r.value}`).join(', ')}, ${netLabel.toLowerCase()} ${signed(net(idx))}.` : ''
  const barW = n > 40 ? '70%' : '60%'

  return (
    <div className="w-full">
      <div className="flex">
        <YAxis ticks={scale.ticks} max={scale.max} format={axisFormat(unit)} height={height} mirror />
        <div
          {...handlers}
          role="group"
          aria-label={`${summary} ${KEY_HINT}`}
          aria-describedby={liveId}
          className="relative min-w-0 flex-1 touch-pan-y rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2"
          style={{ height }}
        >
          <Grid ticks={scale.ticks} max={scale.max} mirror />
          <div className="absolute inset-0 flex" aria-hidden="true">
            {points.map((p, i) => (
              <div key={p.key} className={cn('relative h-full flex-1', idx === i && 'bg-night-50')}>
                {(up.values[i] ?? 0) > 0 && (
                  <span className="absolute bottom-1/2 left-1/2 max-w-[24px] -translate-x-1/2 rounded-t-[4px]" style={{ width: barW, height: `${h(up.values[i])}%`, background: VIZ[up.color], marginBottom: 1 }} />
                )}
                {(down.values[i] ?? 0) > 0 && (
                  <span className="absolute left-1/2 top-1/2 max-w-[24px] -translate-x-1/2 rounded-b-[4px]" style={{ width: barW, height: `${h(down.values[i])}%`, background: VIZ[down.color], marginTop: 1 }} />
                )}
              </div>
            ))}
          </div>
          {idx != null && <Tooltip x={x(idx)} title={points[idx].longLabel} rows={tipRows} footer={`${netLabel} : ${signed(net(idx))}`} />}
          <span id={liveId} className="sr-only" aria-live="polite">{live}</span>
        </div>
      </div>
      <XAxis points={points} x={x} />
    </div>
  )
}

// --- Choix de séries (cases à cocher) ------------------------------------------------------------

export function SeriesToggles({
  legend,
  items,
  checked,
  onChange,
}: {
  legend: string
  items: { id: string; label: string; color: VizColor }[]
  checked: Record<string, boolean>
  onChange: (id: string, value: boolean) => void
}) {
  const name = useId()
  const onCount = items.filter((i) => checked[i.id]).length
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{legend}</legend>
      {items.map((i) => {
        const on = checked[i.id]
        return (
          <label key={i.id} className="relative">
            <input
              type="checkbox"
              name={name}
              className="peer sr-only"
              checked={on}
              // Au moins une série reste affichée.
              disabled={on && onCount === 1}
              onChange={(e) => onChange(i.id, e.target.checked)}
            />
            <span
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-1 peer-disabled:cursor-not-allowed',
                on ? 'border-night-300 bg-white text-night-900' : 'border-night-100 bg-night-50 text-night-500 line-through',
              )}
            >
              <span className="h-0.5 w-4 rounded-full" style={{ background: on ? VIZ[i.color] : '#b6c8df' }} aria-hidden="true" />
              {i.label}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** Sélecteur à boutons radio (même style que le choix jour / semaine / mois des inscriptions). */
export function Segmented<T extends string>({ legend, options, value, onChange }: { legend: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const name = useId()
  return (
    <fieldset className="flex rounded-xl border border-night-200 bg-white p-0.5">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[0.6rem] px-3 text-sm font-semibold transition-colors motion-reduce:transition-none',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-1',
              value === o.value ? 'bg-night-900 text-white' : 'text-night-700 hover:bg-night-50',
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function EmptyChart({ children, height = 220 }: { children: ReactNode; height?: number }) {
  return (
    <p className="flex items-center justify-center rounded-xl border border-dashed border-night-200 px-4 text-center text-sm text-night-600" style={{ minHeight: height }}>
      {children}
    </p>
  )
}
