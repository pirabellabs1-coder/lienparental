/**
 * Fuseau horaire de référence de l'application (lancement en Guyane).
 *
 * Module PUR (ni React, ni navigateur, ni serveur), sans dépendance : uniquement Intl.
 * Règle unique, de bout en bout :
 *   - un INSTANT (ISO UTC en base : occurred_at, start_at, created_at…) se lit, se regroupe
 *     par jour / mois et s'affiche dans DEFAULT_TZ — jamais dans le fuseau du navigateur
 *     ni dans celui du serveur ;
 *   - une saisie « jour + heure murale » (formulaires) devient un instant via wallTimeToIso ;
 *   - une date « jour seul » ("yyyy-mm-dd") n'est PAS un instant : on la manipule comme
 *     chaîne, ou comme Date à midi UTC (`dayKeyToDate`) formatée avec `timeZone: 'UTC'`.
 */

export const DEFAULT_TZ = 'America/Cayenne' // UTC-3, sans heure d'été

const DAY_MS = 86_400_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{1,2}):(\d{2})$/

const pad = (n: number) => String(n).padStart(2, '0')

// --- Lecture d'un instant dans un fuseau ---------------------------------------------

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(tz, f)
  }
  return f
}

type Wall = { y: number; m: number; d: number; hh: number; mm: number; ss: number }

export type InstantInput = Date | string | number

function toMs(input: InstantInput): number {
  if (input instanceof Date) return input.getTime()
  if (typeof input === 'number') return input
  return new Date(input).getTime()
}

/** Composantes « murales » d'un instant dans `tz` (mois 1-12). */
function wallParts(ms: number, tz: string): Wall {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  // Certains moteurs rendent minuit « 24 » malgré h23.
  return { y: out.year, m: out.month, d: out.day, hh: out.hour === 24 ? 0 : out.hour, mm: out.minute, ss: out.second }
}

/** Décalage (ms) de `tz` par rapport à UTC à l'instant `ms` (Cayenne : −3 h). */
export function tzOffsetMs(ms: number, tz: string = DEFAULT_TZ): number {
  const w = wallParts(ms, tz)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss)
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000))
}

/** "yyyy-mm-dd" d'un instant dans `tz`. Une chaîne déjà « jour seul » est renvoyée telle quelle. */
export function dayKeyInTz(input: InstantInput, tz: string = DEFAULT_TZ): string {
  if (typeof input === 'string' && DAY_KEY.test(input)) return input
  const ms = toMs(input)
  if (Number.isNaN(ms)) return ''
  const w = wallParts(ms, tz)
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`
}

/** "HH:mm" d'un instant dans `tz` ("" pour une date « jour seul » ou invalide). */
export function timeInTz(input: InstantInput, tz: string = DEFAULT_TZ): string {
  if (typeof input === 'string' && DAY_KEY.test(input)) return ''
  const ms = toMs(input)
  if (Number.isNaN(ms)) return ''
  const w = wallParts(ms, tz)
  return `${pad(w.hh)}:${pad(w.mm)}`
}

/** "yyyy-mm" d'un instant dans `tz`. */
export function monthKeyInTz(input: InstantInput, tz: string = DEFAULT_TZ): string {
  return dayKeyInTz(input, tz).slice(0, 7)
}

/**
 * Heure murale ("yyyy-mm-dd" + "HH:mm") dans `tz` → instant ISO UTC.
 * Deux passes : correct aussi autour d'un changement d'heure (fuseaux à DST).
 * Heure inexistante (saut de printemps) : décalée de la durée du saut, comme les agendas.
 */
export function wallTimeToIso(day: string, time = '00:00', tz: string = DEFAULT_TZ): string {
  const dm = DAY_KEY.exec(day)
  if (!dm) throw new RangeError(`Jour invalide : ${day}`)
  const tm = TIME.exec(time || '00:00')
  const hh = tm ? Number(tm[1]) : 0
  const mm = tm ? Number(tm[2]) : 0
  const guess = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm, 0, 0)
  const off1 = tzOffsetMs(guess, tz)
  let t = guess - off1
  const off2 = tzOffsetMs(t, tz)
  if (off2 !== off1) t = guess - off2
  return new Date(t).toISOString()
}

// --- Dates « jour seul » -------------------------------------------------------------

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && DAY_KEY.test(v)
}

/** "yyyy-mm-dd" → Date à MIDI UTC (à formater avec `timeZone: 'UTC'`). */
export function dayKeyToDate(key: string): Date {
  const m = DAY_KEY.exec(key.slice(0, 10))
  if (!m) return new Date(NaN)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
}

/** Date « jour seul » (midi UTC) → "yyyy-mm-dd". */
export function dateToDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** "yyyy-mm-dd" + n jours (arithmétique calendaire, sans fuseau). */
export function addDaysToKey(key: string, n: number): string {
  return dateToDayKey(new Date(dayKeyToDate(key).getTime() + n * DAY_MS))
}

/** Jour courant dans `tz`. */
export function todayKey(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return dayKeyInTz(now, tz)
}

/** "yyyy-mm" + n mois. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + delta, 1, 12))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/** Bornes d'un mois "yyyy-mm" dans `tz` : [from, to[ en ISO UTC (pour les requêtes). */
export function monthBoundsInTz(month: string, tz: string = DEFAULT_TZ): { from: string; to: string } {
  return { from: wallTimeToIso(`${month}-01`, '00:00', tz), to: wallTimeToIso(`${shiftMonthKey(month, 1)}-01`, '00:00', tz) }
}

/** Bornes d'une plage de jours inclusive dans `tz` : [début du 1er jour, début du lendemain du dernier[. */
export function dayRangeBoundsInTz(fromDay: string, toDay: string, tz: string = DEFAULT_TZ): { from: string; to: string } {
  return { from: wallTimeToIso(fromDay, '00:00', tz), to: wallTimeToIso(addDaysToKey(toDay, 1), '00:00', tz) }
}

/** Formate une date « jour seul » ("yyyy-mm-dd") en fr-FR, sans glissement de jour. */
export function fmtDayKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  return dayKeyToDate(key).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' })
}
