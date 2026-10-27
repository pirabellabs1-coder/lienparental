// Séries temporelles du tableau de bord (0450) : regroupements, taux de
// résiliation, grille de rétention par cohorte, mini-courbes des indicateurs.
// Module pur (aucun accès réseau, aucun secret) : partagé par les sources
// « démo » et « base », et par les composants client.
import { bucketKey, bucketLabels, fillDaily, mrrAllEur, round2, type Pricing } from './compute'
import { dayKeyToDate } from '@/lib/tz'
import type { Cohorts, DailyPoint, DeviceCounts, DeviceKey, Grain, Kpi, RevenueMonth, SubsDay, Trends } from './types'

export type Agg = 'sum' | 'last' | 'avg'

export type SeriesBucket<K extends string> = {
  key: string
  label: string
  longLabel: string
  /** Nombre de jours de la série tombant dans ce regroupement. */
  days: number
  values: Record<K, number>
}

type NumericKeys<R> = { [P in keyof R]: R[P] extends number ? P : never }[keyof R] & string

/**
 * Regroupe des lignes quotidiennes par jour, semaine ou mois. Chaque champ a
 * son agrégat : somme (flux), dernière valeur (stock, ex. abonnés en fin de
 * période) ou moyenne quotidienne.
 */
export function bucketRows<R extends { day: string }, K extends NumericKeys<R>>(
  rows: readonly R[],
  grain: Grain,
  fields: Record<K, Agg>,
): SeriesBucket<K>[] {
  const keys = Object.keys(fields) as K[]
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const out: SeriesBucket<K>[] = []
  const sums = new Map<string, Record<K, number>>()
  for (const r of sorted) {
    const k = bucketKey(r.day, grain)
    let b = out[out.length - 1]
    if (!b || b.key !== k) {
      b = { key: k, ...bucketLabels(k, grain), days: 0, values: {} as Record<K, number> }
      out.push(b)
      sums.set(k, {} as Record<K, number>)
    }
    const acc = sums.get(k)!
    b.days++
    for (const f of keys) {
      const v = Number(r[f]) || 0
      acc[f] = (acc[f] ?? 0) + v
      b.values[f] = fields[f] === 'last' ? v : acc[f]
    }
  }
  for (const b of out) {
    for (const f of keys) if (fields[f] === 'avg') b.values[f] = round2(b.values[f] / Math.max(1, b.days))
  }
  return out
}

/** Grain des courbes : quotidien jusqu'à 120 jours, hebdomadaire au-delà. */
export function lineGrain(days: number): Grain {
  return days <= 120 ? 'jour' : 'semaine'
}

/**
 * Taux de résiliation (%) par regroupement : résiliations / abonnés au début
 * du regroupement. Les abonnés au début se déduisent du stock de fin et des
 * flux : début = fin − nouveaux + résiliations. null si aucun abonné au début.
 */
export function churnRates(points: readonly { total: number; started: number; canceled: number }[]): (number | null)[] {
  return points.map((p) => {
    const start = p.total - p.started + p.canceled
    return start > 0 ? round2((p.canceled / start) * 100) : null
  })
}

export const subsTotal = (s: Omit<SubsDay, 'day'>) => s.premiumMonthly + s.premiumYearly + s.coparentaliteMonthly + s.coparentaliteYearly

/** MRR en fin de journée, avec les prix en vigueur (même formule que l'indicateur MRR). */
export function mrrSeries(subs: readonly SubsDay[], pricing: Pricing): DailyPoint[] {
  return subs.map((s) => ({ day: s.day, value: mrrAllEur(s, pricing) }))
}

// --- Cohortes -----------------------------------------------------------------

export type CohortCell = { active: number; pct: number | null; partial: boolean }
export type CohortRow = { week: string; size: number; cells: CohortCell[] }
export type CohortGrid = {
  /** Nombre de colonnes (semaines écoulées, 0 compris) de la plus ancienne cohorte. */
  columns: number
  rows: CohortRow[]
  /** Rétention moyenne pondérée par semaine écoulée, semaines complètes uniquement. */
  average: (number | null)[]
}

/**
 * Grille de rétention : une ligne par cohorte (plus ancienne en premier),
 * pourcentage d'actifs par semaine écoulée. La dernière cellule de chaque
 * ligne correspond à la dernière semaine mesurée : si elle n'est pas finie
 * (dernier jour mesuré avant le dimanche), elle est marquée partielle et
 * exclue de la moyenne.
 */
export function cohortGrid(c: Cohorts): CohortGrid {
  const lastWeekComplete = c.lastDay != null && dayKeyToDate(c.lastDay).getUTCDay() === 0
  const rows: CohortRow[] = [...c.cohorts]
    .sort((a, b) => (a.week < b.week ? -1 : 1))
    .map((co) => ({
      week: co.week,
      size: co.size,
      cells: co.active.map((n, k) => ({
        active: n,
        pct: co.size > 0 ? round2((Math.min(n, co.size) / co.size) * 100) : null,
        partial: k === co.active.length - 1 && !lastWeekComplete,
      })),
    }))
  const columns = Math.max(0, ...rows.map((r) => r.cells.length))
  const average: (number | null)[] = []
  for (let k = 0; k < columns; k++) {
    let size = 0
    let active = 0
    for (const r of rows) {
      const cell = r.cells[k]
      if (!cell || cell.partial || r.size === 0) continue
      size += r.size
      active += Math.min(cell.active, r.size)
    }
    average.push(size > 0 ? round2((active / size) * 100) : null)
  }
  return { columns, rows, average }
}

// --- Appareils ------------------------------------------------------------------

export const DEVICE_LABELS: Record<DeviceKey, string> = {
  mobile: 'Mobile',
  ordinateur: 'Ordinateur',
  tablette: 'Tablette',
  inconnu: 'Non identifié',
}

export function deviceShares(c: DeviceCounts): { total: number; rows: { key: DeviceKey; label: string; count: number; pct: number }[] } {
  const keys: DeviceKey[] = ['mobile', 'ordinateur', 'tablette', 'inconnu']
  const total = keys.reduce((s, k) => s + c[k], 0)
  return {
    total,
    rows: keys
      .map((k) => ({ key: k, label: DEVICE_LABELS[k], count: c[k], pct: total > 0 ? round2((c[k] / total) * 100) : 0 }))
      .filter((r) => r.key !== 'inconnu' || r.count > 0),
  }
}

// --- Mini-courbes des indicateurs ---------------------------------------------------

export const SPARK_POINTS = 12

const tail = (v: number[], n = SPARK_POINTS) => v.slice(Math.max(0, v.length - n))

/**
 * Ajoute à chaque indicateur qui a une série la mini-courbe de ses derniers
 * regroupements (au grain de la période). Les indicateurs sans série restent
 * sans mini-courbe (jamais de valeur inventée).
 */
export function attachSparklines(
  kpis: Kpi[],
  input: { trends: Trends | null; signupsDaily: DailyPoint[]; revenueMonthly: RevenueMonth[]; grain: Grain; fromDay: string; toDay: string },
): Kpi[] {
  const { trends: t, grain } = input
  const spark = new Map<string, number[]>()
  const daily = (pts: DailyPoint[], agg: Agg) => bucketRows(pts.map((p) => ({ day: p.day, value: p.value })), grain, { value: agg }).map((b) => b.values.value)
  // Série creuse (jours sans inscription absents) : complétée à 0 sur la période.
  if (input.signupsDaily.length) spark.set('nouveaux', daily(fillDaily(input.signupsDaily, input.fromDay, input.toDay), 'sum'))
  if (input.revenueMonthly.length) {
    spark.set('revenus-mois', input.revenueMonthly.map((r) => round2(r.subscriptionsEur + r.donationsEur)))
    spark.set('dons', input.revenueMonthly.map((r) => r.donationsEur))
  }
  if (t) {
    if (t.accountsDaily.length) spark.set('inscrits', daily(t.accountsDaily, 'last'))
    // Pas de mini-courbe pour « Actifs (7 j) » : l'indicateur compte aussi les connexions, la série non.
    if (t.mrrDaily.length) spark.set('mrr', daily(t.mrrDaily, 'last'))
    if (t.subsDaily.length) {
      const s = bucketRows(t.subsDaily, grain, { premiumMonthly: 'last', premiumYearly: 'last', coparentaliteMonthly: 'last', coparentaliteYearly: 'last' })
      spark.set('premium-mensuel', s.map((b) => b.values.premiumMonthly))
      spark.set('premium-annuel', s.map((b) => b.values.premiumYearly))
      spark.set('coparentalite-mensuel', s.map((b) => b.values.coparentaliteMonthly))
      spark.set('coparentalite-annuel', s.map((b) => b.values.coparentaliteYearly))
    }
    if (t.subsFlowDaily.length) spark.set('desabonnements', bucketRows(t.subsFlowDaily, grain, { canceled: 'sum' }).map((b) => b.values.canceled))
    if (t.activityDaily.length) {
      const a = bucketRows(t.activityDaily, grain, { ai: 'sum', documents: 'sum' })
      spark.set('coach', a.map((b) => b.values.ai))
      spark.set('documents', a.map((b) => b.values.documents))
    }
  }
  return kpis.map((k) => {
    const v = spark.get(k.id)
    return v && v.length >= 2 ? { ...k, spark: tail(v) } : k
  })
}
