/**
 * Événements récurrents du calendrier : règle, calcul des occurrences, exceptions.
 *
 * Module PUR (ni React, ni base), partagé par le navigateur, le serveur et le cron des rappels.
 *
 * Règle stockée (colonne calendar_events.rrule) :
 *   - RRULE RFC 5545 : FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL ; BYDAY (MO…SU, ou 2TU / -1FR
 *     en mensuel) ; BYMONTHDAY ; COUNT ou UNTIL (UTC, « …T…Z »). DTSTART = start_at de l'événement,
 *     lu dans son fuseau IANA (colonne tzid) ;
 *   - vacances scolaires (non exprimables en RRULE : dates publiées chaque année) :
 *     « X-LP-HOLIDAYS=1;ZONE=guyane;PART=ALL|FIRST|SECOND;YEARS=ALL|EVEN|ODD ».
 *
 * Heures « murales » : une série à 18h en Guyane reste à 18h heure de Guyane (America/Cayenne),
 * quel que soit le fuseau de l'appareil, et y compris dans un fuseau à heure d'été (Paris).
 * Les occurrences ne sont jamais stockées : elles sont calculées pour la période affichée.
 */
import { SCHOOL_HOLIDAYS, ZONE_OPTIONS, type ZoneScolaire } from '@/lib/garde'
import { addDaysToKey, dayKeyInTz, dayKeyToDate, timeInTz, wallTimeToIso } from '@/lib/tz'

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export type RRule = {
  kind: 'rrule'
  freq: Freq
  interval: number
  /** Jours de la semaine (hebdomadaire). */
  byDay?: Weekday[]
  /** Mensuel « le 2e mardi » (pos 1…4, ou -1 = dernier). */
  byNthDay?: { pos: number; day: Weekday }
  /** Mensuel « le 15 du mois ». */
  byMonthDay?: number
  count?: number
  /** Instant ISO UTC inclus (dernière occurrence possible). */
  until?: string
}

export type HolidayPart = 'ALL' | 'FIRST' | 'SECOND'
export type HolidayYears = 'ALL' | 'EVEN' | 'ODD'
export type HolidayRule = { kind: 'holidays'; zone: ZoneScolaire; part: HolidayPart; years: HolidayYears; until?: string }

export type Rule = RRule | HolidayRule

export const EVENT_STATUSES = ['prevu', 'confirme', 'reporte', 'annule', 'realise'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const MAX_INTERVAL = 99
export const MAX_COUNT = 730
/** Garde-fou : occurrences calculées au plus par série et par période affichée. */
export const MAX_OCCURRENCES = 1500

const ZONES = new Set<string>(ZONE_OPTIONS.map((z) => z.value))
const DAY_MS = 86_400_000

// --- Lecture / écriture de la règle -------------------------------------------------------

const UNTIL_RE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/

function untilToIso(v: string): string | null {
  const m = UNTIL_RE.exec(v)
  if (!m) return null
  // Forme « date seule » (tolérée) : fin de journée UTC.
  const [h, mi, s] = m[4] ? [m[4], m[5], m[6]] : ['23', '59', '59']
  const iso = `${m[1]}-${m[2]}-${m[3]}T${h}:${mi}:${s}.000Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function isoToUntil(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Lit une règle stockée ; null si elle est absente ou invalide (l'événement reste alors ponctuel). */
export function parseRule(raw: string | null | undefined): Rule | null {
  if (!raw || raw.length > 300) return null
  const parts = new Map<string, string>()
  for (const p of raw.trim().replace(/^RRULE:/i, '').split(';')) {
    const i = p.indexOf('=')
    if (i > 0) parts.set(p.slice(0, i).toUpperCase(), p.slice(i + 1).trim())
  }
  if (parts.get('X-LP-HOLIDAYS') === '1') {
    const zone = parts.get('ZONE') ?? ''
    const part = (parts.get('PART') ?? 'ALL').toUpperCase()
    const years = (parts.get('YEARS') ?? 'ALL').toUpperCase()
    if (!ZONES.has(zone) || !['ALL', 'FIRST', 'SECOND'].includes(part) || !['ALL', 'EVEN', 'ODD'].includes(years)) return null
    const rule: HolidayRule = { kind: 'holidays', zone: zone as ZoneScolaire, part: part as HolidayPart, years: years as HolidayYears }
    if (parts.has('UNTIL')) {
      const iso = untilToIso(parts.get('UNTIL')!)
      if (!iso) return null
      rule.until = iso
    }
    return rule
  }
  const freq = parts.get('FREQ') as Freq | undefined
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return null
  const rule: RRule = { kind: 'rrule', freq, interval }
  const byDay = parts.get('BYDAY')
  if (byDay) {
    const nth = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.exec(byDay)
    if (freq === 'MONTHLY' && nth) rule.byNthDay = { pos: Number(nth[1]), day: nth[2] as Weekday }
    else {
      const days = byDay.split(',')
      if (freq !== 'WEEKLY' || days.some((d) => !WEEKDAYS.includes(d as Weekday))) return null
      rule.byDay = WEEKDAYS.filter((d) => days.includes(d))
    }
  }
  const md = parts.get('BYMONTHDAY')
  if (md) {
    const n = Number(md)
    if (freq !== 'MONTHLY' || !Number.isInteger(n) || n < 1 || n > 31) return null
    // Tous les 12 (24…) mois le 29 ou plus : le même mois revient toujours, la date peut ne jamais exister.
    if (n >= 29 && interval % 12 === 0) return null
    rule.byMonthDay = n
  }
  if (parts.has('COUNT') && parts.has('UNTIL')) return null
  if (parts.has('COUNT')) {
    const n = Number(parts.get('COUNT'))
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) return null
    rule.count = n
  }
  if (parts.has('UNTIL')) {
    const iso = untilToIso(parts.get('UNTIL')!)
    if (!iso) return null
    rule.until = iso
  }
  return rule
}

/** Règle → chaîne stockée (RRULE RFC 5545, sans le préfixe « RRULE: »). */
export function formatRule(rule: Rule): string {
  if (rule.kind === 'holidays') return `X-LP-HOLIDAYS=1;ZONE=${rule.zone};PART=${rule.part};YEARS=${rule.years}${rule.until ? `;UNTIL=${isoToUntil(rule.until)}` : ''}`
  const out = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`)
  if (rule.freq === 'WEEKLY' && rule.byDay?.length) out.push(`BYDAY=${WEEKDAYS.filter((d) => rule.byDay!.includes(d)).join(',')}`)
  if (rule.freq === 'MONTHLY' && rule.byNthDay) out.push(`BYDAY=${rule.byNthDay.pos}${rule.byNthDay.day}`)
  else if (rule.freq === 'MONTHLY' && rule.byMonthDay) out.push(`BYMONTHDAY=${rule.byMonthDay}`)
  if (rule.count) out.push(`COUNT=${rule.count}`)
  else if (rule.until) out.push(`UNTIL=${isoToUntil(rule.until)}`)
  return out.join(';')
}

/** Fin de répétition « jusqu'au jour J inclus » dans le fuseau de la série → UNTIL (fin de journée). */
export function untilEndOfDay(day: string, tz: string): string {
  return new Date(Date.parse(wallTimeToIso(addDaysToKey(day, 1), '00:00', tz)) - 1000).toISOString()
}

// --- Calcul des occurrences ---------------------------------------------------------------

/** Série à développer : instants de la PREMIÈRE occurrence, fuseau IANA, règle. */
export type Series = { start: string; end: string; tz: string; rule: Rule }

/** Occurrence calculée : `key` = début prévu par la règle (identifiant stable, même si elle est déplacée). */
export type Occurrence = { key: string; start: string; end: string }

/** Lundi = 0 … dimanche = 6, pour un jour "yyyy-mm-dd". */
function weekdayIndex(day: string): number {
  return (dayKeyToDate(day).getUTCDay() + 6) % 7
}

function daysBetween(a: string, b: string): number {
  return Math.round((dayKeyToDate(b).getTime() - dayKeyToDate(a).getTime()) / DAY_MS)
}

function ymd(y: number, m: number, d: number): string | null {
  // m : 0-11 (déborde sur l'année). Jour inexistant (31 avril, 29 février) : null (RFC 5545 : ignoré).
  const date = new Date(Date.UTC(y, m, d, 12))
  if (date.getUTCDate() !== d) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nthWeekdayOfMonth(y: number, m: number, pos: number, day: Weekday): string | null {
  const target = WEEKDAYS.indexOf(day)
  if (pos > 0) {
    const first = ymd(y, m, 1)
    if (!first) return null
    const offset = (target - weekdayIndex(first) + 7) % 7
    return ymd(y, m, 1 + offset + (pos - 1) * 7)
  }
  // Dernier : on part du dernier jour du mois.
  const last = new Date(Date.UTC(y, m + 1, 0, 12))
  const lastKey = ymd(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())!
  const back = (weekdayIndex(lastKey) - target + 7) % 7
  return addDaysToKey(lastKey, -back)
}

/**
 * Jours candidats (heure murale de la série), dans l'ordre, à partir du premier jour.
 * `skipTo` : premier jour utile (période affichée), pour ne pas parcourir des années pour rien
 * quand aucun COUNT n'impose de compter depuis le début.
 */
function* candidateDays(rule: RRule, firstDay: string, skipTo: string | null): Generator<string> {
  const step = rule.interval
  const [y0, m0, d0] = firstDay.split('-').map(Number)
  // Plafond d'ITÉRATIONS (pas seulement de dates produites) : une règle qui ne tombe jamais
  // (« le 31 », tous les 12 mois, à partir de février) ne doit pas bloquer le moteur.
  const MAX_STEPS = 20_000
  if (rule.freq === 'DAILY') {
    const k0 = skipTo ? Math.max(0, Math.floor(daysBetween(firstDay, skipTo) / step)) : 0
    for (let k = k0; k < k0 + MAX_STEPS; k++) yield addDaysToKey(firstDay, k * step)
    return
  }
  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay?.length ? rule.byDay : [WEEKDAYS[weekdayIndex(firstDay)]]
    const monday = addDaysToKey(firstDay, -weekdayIndex(firstDay))
    const k0 = skipTo ? Math.max(0, Math.floor(daysBetween(monday, skipTo) / (7 * step))) : 0
    for (let k = k0; k < k0 + MAX_STEPS; k++) {
      const weekStart = addDaysToKey(monday, k * 7 * step)
      for (const d of days) {
        const day = addDaysToKey(weekStart, WEEKDAYS.indexOf(d))
        if (day >= firstDay) yield day
      }
    }
    return
  }
  if (rule.freq === 'MONTHLY') {
    for (let k = 0; k < MAX_STEPS; k++) {
      const m = m0 - 1 + k * step
      const y = y0 + Math.floor(m / 12)
      const mm = ((m % 12) + 12) % 12
      const day = rule.byNthDay ? nthWeekdayOfMonth(y, mm, rule.byNthDay.pos, rule.byNthDay.day) : ymd(y, mm, rule.byMonthDay ?? d0)
      if (day && day >= firstDay) yield day
    }
    return
  }
  for (let k = 0; k < MAX_STEPS; k++) {
    const day = ymd(y0 + k * step, m0 - 1, d0)
    if (day) yield day
  }
}

/**
 * Occurrences d'une série qui chevauchent [from, to[ (instants ISO), dans l'ordre.
 * La durée est conservée en heure murale (vendredi 18h → dimanche 18h, même lors d'un changement d'heure).
 */
export function expandSeries(series: Series, from: string, to: string): Occurrence[] {
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  const firstDay = dayKeyInTz(series.start, series.tz)
  const startTime = timeInTz(series.start, series.tz)
  const endTime = timeInTz(series.end, series.tz)
  const spanDays = Math.max(0, daysBetween(firstDay, dayKeyInTz(series.end, series.tz)))
  const make = (day: string, endDay: string = addDaysToKey(day, spanDays)): Occurrence => {
    const start = wallTimeToIso(day, startTime, series.tz)
    let end = wallTimeToIso(endDay, endTime, series.tz)
    if (Date.parse(end) < Date.parse(start)) end = start
    return { key: start, start, end }
  }

  const out: Occurrence[] = []
  if (series.rule.kind === 'holidays') {
    const r = series.rule
    for (const h of SCHOOL_HOLIDAYS) {
      if (!h.zones.includes(r.zone) || h.start < firstDay) continue
      const year = Number(h.start.slice(0, 4))
      if ((r.years === 'EVEN' && year % 2 !== 0) || (r.years === 'ODD' && year % 2 === 0)) continue
      // Même découpage que le planning de garde (lib/garde → holidayAt) : moitié = jours entiers.
      const mid = addDaysToKey(h.start, Math.floor(daysBetween(h.start, h.end) / 2))
      const [a, b] = r.part === 'FIRST' ? [h.start, mid] : r.part === 'SECOND' ? [mid, h.end] : [h.start, h.end]
      const occ = make(a, b)
      if (r.until && Date.parse(occ.start) > Date.parse(r.until)) continue
      if (Date.parse(occ.end) > fromMs && Date.parse(occ.start) < toMs) out.push(occ)
    }
    return out
  }

  const rule = series.rule
  const untilMs = rule.until ? Date.parse(rule.until) : Infinity
  // Marge pour les occurrences longues commencées avant la période affichée.
  const skipTo = rule.count ? null : addDaysToKey(dayKeyInTz(from, series.tz), -(spanDays + 1))
  let n = 0
  let guard = 0
  for (const day of candidateDays(rule, firstDay, skipTo)) {
    if (++guard > 50_000 || out.length >= MAX_OCCURRENCES) break
    const occ = make(day)
    const s = Date.parse(occ.start)
    if (s > untilMs || s >= toMs) break
    n++
    if (rule.count && n > rule.count) break
    if (Date.parse(occ.end) > fromMs) out.push(occ)
  }
  return out
}

/** Dernier instant couvert par la série (fin de la dernière occurrence), ou null si elle est sans fin. */
export function seriesEnd(series: Series): string | null {
  const rule = series.rule
  // Sans fin explicite : sans fin (vacances comprises, les dates des années suivantes seront ajoutées).
  if (!(rule.kind === 'rrule' && rule.count) && !rule.until) return null
  const horizon = rule.until ?? '9999-12-31T00:00:00.000Z'
  const all = expandSeries(series, series.start, new Date(Date.parse(horizon) + 1000).toISOString())
  return all.length ? all[all.length - 1].end : series.end
}

/** Première occurrence réelle (le jour de début peut ne pas être prévu par la règle, ex. BYDAY). */
export function firstOccurrence(series: Series): Occurrence | null {
  for (const days of [62, 800, 4000]) {
    const found = expandSeries(series, series.start, new Date(Date.parse(series.start) + days * DAY_MS).toISOString())[0]
    if (found) return found
  }
  return null
}

/** Nombre d'occurrences de la série avant `occurrence` (pour « et les suivantes » d'une série « N fois »). */
export function occurrencesBefore(series: Series, occurrence: string): number {
  return expandSeries(series, series.start, occurrence).filter((o) => Date.parse(o.key) < Date.parse(occurrence)).length
}

/** Règle arrêtée juste avant une occurrence (« cet événement et les suivants »). */
export function truncateBefore<R extends Rule>(rule: R, occurrenceStart: string): R {
  const until = new Date(Date.parse(occurrenceStart) - 1000).toISOString()
  if (rule.kind === 'holidays') return { ...rule, until }
  const next: RRule = { ...(rule as RRule), until }
  delete next.count
  return next as R
}

// --- Libellés de règle (aperçu, détail) ---------------------------------------------------

/** Clé de règle courante, pour les choix rapides du formulaire. */
export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'holidays' | 'custom'

export function presetOf(rule: Rule | null): RepeatPreset {
  if (!rule) return 'none'
  if (rule.kind === 'holidays') return 'holidays'
  if (rule.freq === 'DAILY' && rule.interval === 1) return 'daily'
  if (rule.freq === 'WEEKLY' && rule.interval === 1) return 'weekly'
  if (rule.freq === 'WEEKLY' && rule.interval === 2) return 'biweekly'
  if (rule.freq === 'MONTHLY' && rule.interval === 1) return 'monthly'
  if (rule.freq === 'YEARLY' && rule.interval === 1) return 'yearly'
  return 'custom'
}
