/**
 * Formulaire « Répétition » du calendrier : état de saisie ↔ règle (lib/recurrence). Module pur, testé.
 * Choix rapides (tous les jours, chaque semaine…) ou règle personnalisée (tous les N jours / semaines /
 * mois / ans), fin de répétition (jamais, date incluse, nombre de fois), vacances scolaires.
 */
import { DEFAULT_ZONE, type ZoneScolaire } from '@/lib/garde'
import {
  WEEKDAYS, expandSeries, formatRule, occurrencesBefore, parseRule, presetOf, untilEndOfDay,
  type HolidayPart, type HolidayYears, type RRule, type RepeatPreset, type Rule, type Weekday,
} from '@/lib/recurrence'
import { dayKeyInTz, dayKeyToDate } from '@/lib/tz'

export type RepeatUnit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type EndMode = 'never' | 'until' | 'count'
export type MonthlyMode = 'day' | 'nth'

export type RecurrenceState = {
  preset: RepeatPreset
  /** Personnalisée : tous les `interval` `unit`. */
  interval: number
  unit: RepeatUnit
  /** Hebdomadaire : jours choisis (vide = jour de début). */
  days: Weekday[]
  monthly: MonthlyMode
  end: EndMode
  /** Jour inclus "yyyy-mm-dd". */
  untilDate: string
  count: number
  zone: ZoneScolaire
  part: HolidayPart
  years: HolidayYears
  /**
   * Fin enregistrée, reprise telle quelle tant que la date de fin n'est pas touchée : une série
   * arrêtée « juste avant » une occurrence ne doit pas être rallongée jusqu'au soir (doublon).
   */
  keepUntil?: { day: string; iso: string }
}

export const DEFAULT_RECURRENCE: RecurrenceState = {
  preset: 'none', interval: 1, unit: 'DAILY', days: [], monthly: 'day', end: 'never', untilDate: '', count: 10,
  zone: DEFAULT_ZONE, part: 'ALL', years: 'ALL',
}

/** Jour de la semaine (RRULE) d'un jour "yyyy-mm-dd". */
export function weekdayOf(day: string): Weekday {
  return WEEKDAYS[(dayKeyToDate(day).getUTCDay() + 6) % 7]
}

/** Position du jour dans le mois pour « le 2e mardi » : 1 à 4, ou -1 (« le dernier ») au-delà du 28. */
export function nthOf(day: string): number {
  const d = Number(day.slice(8, 10))
  return d > 28 ? -1 : Math.ceil(d / 7)
}

/** État de saisie → règle stockée (null = une seule fois). `startDay` : jour de début de l'événement. */
export function buildRule(s: RecurrenceState, startDay: string, tz: string): string | null {
  if (s.preset === 'none' || !startDay) return null
  let rule: Rule
  if (s.preset === 'holidays') {
    rule = { kind: 'holidays', zone: s.zone, part: s.part, years: s.years }
  } else {
    const freq: RepeatUnit = s.preset === 'daily' ? 'DAILY'
      : s.preset === 'weekly' || s.preset === 'biweekly' ? 'WEEKLY'
        : s.preset === 'monthly' ? 'MONTHLY'
          : s.preset === 'yearly' ? 'YEARLY'
            : s.unit
    const interval = s.preset === 'biweekly' ? 2 : s.preset === 'custom' ? Math.min(99, Math.max(1, Math.round(s.interval) || 1)) : 1
    const r: RRule = { kind: 'rrule', freq, interval }
    if (freq === 'WEEKLY') r.byDay = s.days.length ? WEEKDAYS.filter((d) => s.days.includes(d)) : [weekdayOf(startDay)]
    if (freq === 'MONTHLY') {
      if (s.monthly === 'nth') r.byNthDay = { pos: nthOf(startDay), day: weekdayOf(startDay) }
      else r.byMonthDay = Number(startDay.slice(8, 10))
    }
    rule = r
  }
  if (s.end === 'until' && s.untilDate && s.untilDate >= startDay) {
    rule.until = s.keepUntil && s.keepUntil.day === s.untilDate ? s.keepUntil.iso : untilEndOfDay(s.untilDate, tz)
  }
  if (s.end === 'count' && rule.kind === 'rrule') rule.count = Math.min(730, Math.max(1, Math.round(s.count) || 1))
  return formatRule(rule)
}

/** Fin de répétition antérieure au début : à signaler (sinon la borne serait ignorée et la série sans fin). */
export function untilBeforeStart(s: RecurrenceState, startDay: string): boolean {
  return s.preset !== 'none' && s.end === 'until' && Boolean(s.untilDate) && s.untilDate < startDay
}

/**
 * Règle stockée → état de saisie (édition).
 * - `seriesStart` / `seriesEnd` : bornes de la 1re occurrence, pour retrouver le jour de la dernière occurrence ;
 * - `occurrence` : « et les suivantes » à partir de cette date → une série « N fois » garde le nombre RESTANT.
 */
export function stateFromRule(
  raw: string | null | undefined,
  tz: string,
  opts: { seriesStart?: string; seriesEnd?: string; occurrence?: string } = {},
): RecurrenceState {
  const rule = parseRule(raw)
  if (!rule) return DEFAULT_RECURRENCE
  const preset = presetOf(rule)
  const base: RecurrenceState = { ...DEFAULT_RECURRENCE, preset }
  const series = opts.seriesStart ? { start: opts.seriesStart, end: opts.seriesEnd ?? opts.seriesStart, tz, rule } : null
  if (rule.until) {
    base.end = 'until'
    // Jour de la DERNIÈRE occurrence (une coupe « juste avant le 20 » ne vaut pas « jusqu'au 20 »).
    const last = series ? expandSeries(series, series.start, new Date(Date.parse(rule.until) + 1000).toISOString()).pop() : undefined
    base.untilDate = dayKeyInTz(last?.start ?? rule.until, tz)
    base.keepUntil = { day: base.untilDate, iso: rule.until }
  }
  if (rule.kind === 'holidays') return { ...base, zone: rule.zone, part: rule.part, years: rule.years }
  if (rule.count) {
    base.end = 'count'
    base.count = series && opts.occurrence ? Math.max(1, rule.count - occurrencesBefore(series, opts.occurrence)) : rule.count
  }
  return {
    ...base,
    interval: rule.interval,
    unit: rule.freq,
    days: rule.byDay ?? [],
    monthly: rule.byNthDay ? 'nth' : 'day',
  }
}
