// Sélection de période du tableau de bord : validation stricte (zod) des
// paramètres d'URL, calcul de la période précédente de même durée.
import { z } from 'zod'
import {
  DEFAULT_TZ,
  addDaysToKey,
  dayKeyToDate,
  dayRangeBoundsInTz,
  fmtDayKey,
  isDayKey,
  shiftMonthKey,
  todayKey,
} from '@/lib/tz'
import type { Grain, Period, PeriodKey } from './types'

export const PERIOD_KEYS: readonly PeriodKey[] = ['7j', '30j', '90j', '12m', 'perso']
export const DEFAULT_PERIOD: Exclude<PeriodKey, 'perso'> = '30j'
export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7j': '7 jours',
  '30j': '30 jours',
  '90j': '90 jours',
  '12m': '12 mois',
  perso: 'Personnalisée',
}

/** Plus ancienne date sélectionnable et durée maximale d'une période personnalisée. */
export const MIN_DAY = '2024-01-01'
export const MAX_CUSTOM_DAYS = 731

const DAY_MS = 86_400_000

const dayKey = z.string().refine(isDayKey, 'Date invalide')

export const periodQuerySchema = z.object({
  periode: z.enum(['7j', '30j', '90j', '12m', 'perso']).optional(),
  du: dayKey.optional(),
  au: dayKey.optional(),
})

export type PeriodQuery = z.infer<typeof periodQuerySchema>

export type ParsedPeriod = { period: Period; error: string | null }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function diffDays(fromDay: string, toDay: string): number {
  return Math.round((dayKeyToDate(toDay).getTime() - dayKeyToDate(fromDay).getTime()) / DAY_MS)
}

export function grainFor(days: number): Grain {
  if (days <= 31) return 'jour'
  if (days <= 120) return 'semaine'
  return 'mois'
}

function fmtRange(fromDay: string, toDay: string): string {
  const sameYear = fromDay.slice(0, 4) === toDay.slice(0, 4)
  const a = fmtDayKey(fromDay, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  const b = fmtDayKey(toDay, { day: 'numeric', month: 'short', year: 'numeric' })
  return `du ${a} au ${b}`
}

export function buildPeriod(key: PeriodKey, fromDay: string, toDay: string, tz: string = DEFAULT_TZ): Period {
  const days = diffDays(fromDay, toDay) + 1
  // 12 mois : période précédente alignée sur les mois ; sinon même nombre de jours.
  const prevFromDay = key === '12m' ? `${shiftMonthKey(fromDay.slice(0, 7), -12)}-01` : addDaysToKey(fromDay, -days)
  const prevToDay = addDaysToKey(fromDay, -1)
  const cur = dayRangeBoundsInTz(fromDay, toDay, tz)
  const prev = dayRangeBoundsInTz(prevFromDay, prevToDay, tz)
  return {
    key,
    fromDay,
    toDay,
    prevFromDay,
    prevToDay,
    days,
    from: cur.from,
    to: cur.to,
    prevFrom: prev.from,
    label: fmtRange(fromDay, toDay),
    prevLabel: fmtRange(prevFromDay, prevToDay),
    grain: grainFor(days),
  }
}

/** Période à partir des paramètres d'URL. Toute valeur invalide retombe sur 30 jours, avec un message. */
export function parsePeriod(
  raw: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
): ParsedPeriod {
  const today = todayKey(tz, now)
  const parsed = periodQuerySchema.safeParse({ periode: one(raw.periode), du: one(raw.du) || undefined, au: one(raw.au) || undefined })
  const q: PeriodQuery = parsed.success ? parsed.data : {}
  let error: string | null = parsed.success ? null : 'Paramètres de période invalides : affichage des 30 derniers jours.'

  const key = q.periode ?? DEFAULT_PERIOD
  if (key === 'perso') {
    const du = q.du
    const au = q.au
    if (!du || !au) {
      error = 'Indiquez une date de début et une date de fin.'
    } else if (du > au) {
      error = 'La date de début doit précéder la date de fin.'
    } else if (au > today) {
      error = 'La date de fin ne peut pas être dans le futur.'
    } else if (du < MIN_DAY) {
      error = `La date de début ne peut pas être antérieure au ${fmtDayKey(MIN_DAY, { day: 'numeric', month: 'long', year: 'numeric' })}.`
    } else if (diffDays(du, au) + 1 > MAX_CUSTOM_DAYS) {
      error = 'La période personnalisée est limitée à 2 ans.'
    } else {
      return { period: buildPeriod('perso', du, au, tz), error: null }
    }
    return { period: presetPeriod(DEFAULT_PERIOD, today, tz), error }
  }
  return { period: presetPeriod(key, today, tz), error }
}

export function presetPeriod(key: Exclude<PeriodKey, 'perso'>, today: string, tz: string = DEFAULT_TZ): Period {
  if (key === '12m') return buildPeriod('12m', `${shiftMonthKey(today.slice(0, 7), -11)}-01`, today, tz)
  const n = key === '7j' ? 7 : key === '90j' ? 90 : 30
  return buildPeriod(key, addDaysToKey(today, -(n - 1)), today, tz)
}

/** Paramètres d'URL représentant une période (liens, export CSV). */
export function periodSearch(period: Pick<Period, 'key' | 'fromDay' | 'toDay'>): string {
  const p = new URLSearchParams({ periode: period.key })
  if (period.key === 'perso') {
    p.set('du', period.fromDay)
    p.set('au', period.toDay)
  }
  return p.toString()
}
