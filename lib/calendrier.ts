// M06 — Calendrier & rappels : helpers + mock data.
// Supabase plug-in point : remplacer EVENTS par un fetch Supabase (table `events`)
// filtré par household + range de dates. Les helpers date/heure restent purs.

import { intlLocale } from '@/lib/i18n/config'
import { expandSeries, parseRule, type EventStatus, type Occurrence } from '@/lib/recurrence'
import {
  DEFAULT_TZ, addDaysToKey, currentTz, dateToDayKey, dayKeyInTz, dayKeyToDate, timeInTz, todayKey, wallTimeToIso,
  type InstantInput,
} from './tz'

export { DEFAULT_TZ } // repli (Guyane, UTC-3) — fuseau courant : lib/tz → currentTz()

export type EventTypeKey =
  | 'visite' | 'appel' | 'message' | 'sante' | 'rdv' | 'ecole'
  | 'activite' | 'sortie' | 'repas' | 'deplacement' | 'anniversaire' | 'autre'

export type EventIconKey =
  | 'calendar' | 'video' | 'message' | 'stethoscope' | 'clipboard' | 'school'
  | 'trees' | 'tent' | 'utensils' | 'car' | 'cake' | 'more'

export type EventType = {
  key: EventTypeKey
  label: string
  /** Identifiant d'icône — classes couleur + composant lucide dans components/calendrier/eventTypeStyles.tsx
   *  (Tailwind ne scanne pas lib/, les classes doivent vivre dans components/). */
  icon: EventIconKey
}

/**
 * Types partagés d'office avec l'autre parent quand l'événement concerne un enfant suivi par les deux :
 * ce qu'il doit savoir (santé, école, rendez-vous). Les autres (activités, sorties, visites…) restent
 * masqués par défaut ; le choix reste modifiable sur chaque événement.
 */
export const SHARED_BY_DEFAULT: ReadonlySet<EventTypeKey> = new Set<EventTypeKey>(['sante', 'ecole', 'rdv', 'anniversaire'])

export const EVENT_TYPES: EventType[] = [
  { key: 'visite',       label: 'Visite',       icon: 'calendar' },
  { key: 'appel',        label: 'Appel vidéo',  icon: 'video' },
  { key: 'message',      label: 'Message',      icon: 'message' },
  { key: 'sante',        label: 'Santé',        icon: 'stethoscope' },
  { key: 'rdv',          label: 'Rendez-vous',  icon: 'clipboard' },
  { key: 'ecole',        label: 'École',        icon: 'school' },
  { key: 'activite',     label: 'Activité',     icon: 'trees' },
  { key: 'sortie',       label: 'Sortie',       icon: 'tent' },
  { key: 'repas',        label: 'Repas',        icon: 'utensils' },
  { key: 'deplacement',  label: 'Déplacement',  icon: 'car' },
  { key: 'anniversaire', label: 'Anniversaire', icon: 'cake' },
  { key: 'autre',        label: 'Autre',        icon: 'more' },
]

export function getEventType(key: EventTypeKey): EventType {
  return EVENT_TYPES.find(t => t.key === key) ?? EVENT_TYPES[EVENT_TYPES.length - 1]
}

// --- CalendarEvent ---------------------------------------------------------

export type CalendarEvent = {
  id: string
  title: string
  type: EventTypeKey
  /** ISO date-time début (instant UTC ; lu et affiché dans le fuseau de l'utilisateur, lib/tz → currentTz) */
  start: string
  /** ISO date-time fin */
  end: string
  location?: string
  description?: string
  childrenIds?: string[]
  reminder?: ReminderKey
  /** ISO — horodatage de création (non modifiable, preuve) */
  createdAt?: string
  /** Famille (0340) : visible en lecture seule par les adultes liés aux enfants concernés. */
  familyShared?: boolean
  /** Renseigné quand l'événement vient d'un AUTRE adulte lié : lecture seule (seul l'auteur modifie). */
  sharedBy?: { prenom: string }
  /** Statut (0660) : prévu, confirmé, reporté, annulé, réalisé. Absent = prévu. */
  status?: EventStatus
  /**
   * Série récurrente (0660). Sur la série elle-même (lecture d'un événement par son id) : `rule`
   * et `tz` seuls. Sur une occurrence (listes du calendrier) : id = « idSérie~début prévu (ms) »,
   * `seriesId` et `occurrence` (début prévu, clé stable même si l'occurrence est déplacée).
   */
  recurrence?: { rule: string; tz: string; seriesId?: string; occurrence?: string; seriesStart?: string; seriesEnd?: string }
}

export type ReminderKey = 'none' | '5m' | '15m' | '30m' | '1h' | '1d' | '2d' | 'eve20'

/** Délai fixe (minutes) des rappels « X avant » ; « la veille à 20 h » est calculé à part. */
export const REMINDER_MINUTES: Partial<Record<ReminderKey, number>> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 1440, '2d': 2880 }

export const REMINDER_OPTIONS: { value: ReminderKey; label: string }[] = [
  { value: 'none',  label: 'Aucun rappel' },
  { value: '5m',    label: '5 minutes avant' },
  { value: '15m',   label: '15 minutes avant' },
  { value: '30m',   label: '30 minutes avant' },
  { value: '1h',    label: '1 heure avant' },
  { value: '1d',    label: '1 jour avant' },
  { value: '2d',    label: '2 jours avant' },
  { value: 'eve20', label: 'La veille à 20h' },
]

/**
 * Occurrence modifiée d'une série (0660, calendar_event_exceptions) : supprimée, déplacée (reportée),
 * texte ou statut propre. `occurrence` = début prévu par la règle.
 */
export type OccurrenceException = {
  occurrence: string
  deleted: boolean
  start?: string
  end?: string
  title?: string
  location?: string
  description?: string
  status?: EventStatus
}

const overlaps = (start: string, end: string, from: string, to: string) =>
  Date.parse(end) > Date.parse(from) && Date.parse(start) < Date.parse(to)
  || (Date.parse(start) === Date.parse(end) && Date.parse(start) >= Date.parse(from) && Date.parse(start) < Date.parse(to))

function occurrenceEvent(master: CalendarEvent, o: Occurrence, ex: OccurrenceException | undefined): CalendarEvent {
  const moved = Boolean(ex?.start && Date.parse(ex.start) !== Date.parse(o.start))
  return {
    ...master,
    id: occurrenceId(master.id, o.key),
    start: ex?.start ?? o.start,
    end: ex?.end ?? o.end,
    title: ex?.title ?? master.title,
    location: ex?.location ?? master.location,
    description: ex?.description ?? master.description,
    status: ex?.status ?? (moved ? 'reporte' : master.status),
    recurrence: { ...master.recurrence!, seriesId: master.id, occurrence: o.key, seriesStart: master.start, seriesEnd: master.end },
  }
}

/**
 * Événements à afficher sur [from, to[ : un événement ponctuel tel quel (s'il chevauche la période),
 * une série développée en occurrences (exceptions appliquées, occurrences supprimées retirées,
 * occurrences déplacées DANS la période depuis un autre jour ajoutées). Règle illisible : ponctuel.
 */
export function expandEvent(master: CalendarEvent, exceptions: OccurrenceException[], from: string, to: string): CalendarEvent[] {
  const rule = master.recurrence ? parseRule(master.recurrence.rule) : null
  if (!rule || !master.recurrence || master.recurrence.occurrence) return overlaps(master.start, master.end, from, to) ? [master] : []
  const series = { start: master.start, end: master.end, tz: master.recurrence.tz, rule }
  const byKey = new Map(exceptions.map((e) => [Date.parse(e.occurrence), e]))
  const out: CalendarEvent[] = []
  const seen = new Set<number>()
  for (const o of expandSeries(series, from, to)) {
    const k = Date.parse(o.key)
    seen.add(k)
    const ex = byKey.get(k)
    if (ex?.deleted) continue
    if (ex?.start && ex.end && !overlaps(ex.start, ex.end, from, to)) continue // déplacée hors de la période
    out.push(occurrenceEvent(master, o, ex))
  }
  for (const ex of exceptions) {
    const k = Date.parse(ex.occurrence)
    if (ex.deleted || !ex.start || !ex.end || seen.has(k) || !overlaps(ex.start, ex.end, from, to)) continue
    const original = findOccurrence(master, ex.occurrence)
    if (original) out.push(occurrenceEvent(master, original, ex))
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** Occurrence prévue par la règle à cet instant précis (null si la série n'en prévoit pas). */
export function findOccurrence(master: CalendarEvent, occurrence: string): Occurrence | null {
  const rule = master.recurrence ? parseRule(master.recurrence.rule) : null
  if (!rule || !master.recurrence) return null
  const ms = Date.parse(occurrence)
  const found = expandSeries({ start: master.start, end: master.end, tz: master.recurrence.tz, rule }, new Date(ms - 1).toISOString(), new Date(ms + 1).toISOString())
  return found.find((o) => Date.parse(o.key) === ms) ?? null
}

/** Une occurrence d'une série (exception appliquée), ou null si elle n'existe pas ou a été supprimée. */
export function occurrenceOf(master: CalendarEvent, occurrence: string, ex: OccurrenceException | undefined): CalendarEvent | null {
  if (ex?.deleted) return null
  const o = findOccurrence(master, occurrence)
  return o ? occurrenceEvent(master, o, ex) : null
}

/** Identifiant d'occurrence : « idSérie~début prévu en ms ». */
export const OCCURRENCE_SEP = '~'
export function occurrenceId(seriesId: string, occurrenceStart: string): string {
  return `${seriesId}${OCCURRENCE_SEP}${Date.parse(occurrenceStart)}`
}
export function parseOccurrenceId(id: string): { seriesId: string; occurrence: string } | null {
  const i = id.lastIndexOf(OCCURRENCE_SEP)
  if (i <= 0) return null
  const ms = Number(id.slice(i + 1))
  if (!Number.isSafeInteger(ms)) return null
  return { seriesId: id.slice(0, i), occurrence: new Date(ms).toISOString() }
}

// --- Date helpers ----------------------------------------------------------
// Un « jour » du calendrier est une Date à MIDI UTC (cf. lib/tz → dayKeyToDate) :
// composantes lues en UTC, formatage avec `timeZone: 'UTC'`. Les instants (start/end,
// createdAt) se rattachent à un jour via `dayOf` (fuseau de l'utilisateur, currentTz), jamais via l'heure implicite du navigateur.

const DAY_MS = 86_400_000

/** Jour (midi UTC) d'un instant ou d'une clé "yyyy-mm-dd", dans le fuseau de l'utilisateur. */
export function dayOf(input: InstantInput): Date {
  return dayKeyToDate(dayKeyInTz(input))
}

/** Aujourd'hui (midi UTC) dans le fuseau de l'utilisateur. */
export function todayDay(now: Date = new Date()): Date {
  return dayKeyToDate(todayKey(currentTz(), now))
}

/** Jour (midi UTC) "yyyy-mm-dd". */
export function dayFromKey(key: string): Date {
  return dayKeyToDate(key)
}

/** 1er jour du mois du jour `d` (midi UTC). */
export function startOfMonthDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12))
}

/** 1er jour du mois `d` + n mois (midi UTC). */
export function addMonthsDay(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))
}

/** Jour `d` + n jours (midi UTC). */
export function addDaysDay(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** Lundi en premier (0 = lundi, 6 = dimanche) */
export function weekdayMondayFirst(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

/** Retourne une matrice de semaines (lundi→dimanche) couvrant le mois de `ref`.
 *  `trim` = true : n'ajoute pas les semaines finales entièrement hors du mois. */
export function getMonthMatrix(ref: Date, trim = false): Date[][] {
  const month = ref.getUTCMonth()
  const first = startOfMonthDay(ref)
  const start = addDaysDay(first, -weekdayMondayFirst(first))
  const rows: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const row: Date[] = []
    for (let d = 0; d < 7; d++) row.push(addDaysDay(start, w * 7 + d))
    if (trim && w > 3 && row[0].getUTCMonth() !== month) break
    rows.push(row)
  }
  return rows
}

/** 7 jours lundi→dimanche de la semaine contenant `ref`. */
export function getWeekDays(ref: Date): Date[] {
  const start = addDaysDay(ref, -weekdayMondayFirst(ref))
  return Array.from({ length: 7 }, (_, i) => addDaysDay(start, i))
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}

export function toDateKey(d: Date): string {
  return dateToDayKey(d)
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DAY_FMT = { timeZone: 'UTC' } as const

/** `locale` optionnelle (fr | en | pt ou BCP 47) ; fr-FR par défaut. */
const dateLoc = (locale?: string) => (!locale ? 'fr-FR' : locale.length === 2 ? intlLocale(locale) : locale)

export function fmtMonthYear(d: Date, locale?: string): string {
  return d.toLocaleDateString(dateLoc(locale), { month: 'long', year: 'numeric', ...DAY_FMT })
}

export function fmtDayLong(d: Date, locale?: string): string {
  return d.toLocaleDateString(dateLoc(locale), { weekday: 'long', day: 'numeric', month: 'long', ...DAY_FMT })
}

/** « Dimanche 12 mai 2024 » */
export function fmtDateFull(d: Date, locale?: string): string {
  return capitalize(d.toLocaleDateString(dateLoc(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...DAY_FMT }))
}

/** « 12 mai 2024 » */
export function fmtDateMedium(d: Date, locale?: string): string {
  return d.toLocaleDateString(dateLoc(locale), { day: 'numeric', month: 'long', year: 'numeric', ...DAY_FMT })
}

/** Heure murale "HH:mm" d'un instant, dans le fuseau de l'utilisateur. */
export function fmtTime(iso: string): string {
  return timeInTz(iso)
}

export function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`
}

/** « 14h30 » (notation française des maquettes) */
export function fmtHour(iso: string): string {
  return fmtTime(iso).replace(':', 'h')
}

/** « 14h30 - 17h30 » */
export function fmtHourRange(start: string, end: string): string {
  return `${fmtHour(start)} - ${fmtHour(end)}`
}

/**
 * Heure murale "HH:mm" au format de la langue de l'interface :
 * fr « 14h30 » / « 8h » (notation des maquettes), en « 2:30 PM », pt « 14:30 » (format brésilien, via Intl).
 */
export function fmtWallTime(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (locale === 'fr') return m ? `${h || 0}h${String(m).padStart(2, '0')}` : `${h || 0}h`
  return new Date(Date.UTC(2000, 0, 1, h || 0, m || 0)).toLocaleTimeString(intlLocale(locale), {
    hour: locale === 'en' ? 'numeric' : '2-digit', minute: '2-digit', timeZone: 'UTC',
  })
}

/** Heure d'un instant (fuseau de l'utilisateur) au format de la langue (cf. fmtWallTime). */
export function fmtHourLocale(iso: string, locale: string): string {
  return fmtWallTime(fmtTime(iso), locale)
}

/** Graduation d'une grille horaire : fr « 08h », en « 8 AM », pt « 08:00 ». */
export function fmtHourTickLocale(h: number, locale: string): string {
  if (locale === 'fr') return `${String(h).padStart(2, '0')}h`
  if (locale === 'en') return new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString(intlLocale(locale), { hour: 'numeric', timeZone: 'UTC' })
  return fmtWallTime(`${h}:00`, locale)
}

/** Minutes écoulées depuis minuit (fuseau de l'utilisateur) pour un instant — positionnement sur une grille horaire. */
export function minutesOfDay(iso: string): number {
  const [h, m] = fmtTime(iso).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Instant du rappel « la veille à 20h » (fuseau `tz`, celui de l'auteur par défaut) d'un événement. */
export function eveReminderAt(startIso: string, tz: string = currentTz()): string {
  return wallTimeToIso(addDaysToKey(dayKeyInTz(startIso, tz), -1), '20:00', tz)
}

/** Formate un compte à rebours "Dans 2 jours", "Dans 1 h", "Dans 15 min", "Passé" */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Passé'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const h = Math.floor(min / 60)
  const d = Math.floor(h / 24)
  if (d >= 2) return `Dans ${d} jours`
  if (d === 1) return 'Dans 1 jour'
  if (h >= 2) return `Dans ${h} h`
  if (h === 1) return 'Dans 1 h'
  if (min >= 2) return `Dans ${min} min`
  if (min === 1) return 'Dans 1 min'
  return 'Imminent'
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const key = toDateKey(day)
  return events
    .filter(e => dayKeyInTz(e.start) === key)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

// --- Export agenda externe -------------------------------------------------

function toUtcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toUtcStamp(e.start)}/${toUtcStamp(e.end)}`,
    ctz: currentTz(),
  })
  if (e.description) p.set('details', e.description)
  if (e.location) p.set('location', e.location)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: new Date(e.start).toISOString(),
    enddt: new Date(e.end).toISOString(),
  })
  if (e.description) p.set('body', e.description)
  if (e.location) p.set('location', e.location)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fichier iCalendar (Apple Calendrier, Outlook bureau…). */
export function buildIcs(e: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lien Parental//Calendrier//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@lienparental.fr`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(e.start)}`,
    `DTEND:${toUtcStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    e.location ? `LOCATION:${icsEscape(e.location)}` : '',
    e.description ? `DESCRIPTION:${icsEscape(e.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

// --- Mock enfants ----------------------------------------------------------

export const MOCK_CHILDREN = [
  { id: 'c_1', prenom: 'Lina', age: 8 },
  { id: 'c_2', prenom: 'Noah', age: 11 },
]

export function childrenLabel(ids: string[] | undefined): string {
  return MOCK_CHILDREN
    .filter(c => (ids ?? []).includes(c.id))
    .map(c => `${c.prenom} (${c.age} ans)`)
    .join(', ')
}

// --- Mock events (centrés sur aujourd'hui) ---------------------------------
// Supabase plug-in point : remplacer par `supabase.from('events').select(...)`

// Démo : heures « murales » de la famille de démonstration (Guyane, DEFAULT_TZ), figées au chargement
// du module : ce sont des instants, affichés ensuite dans le fuseau de chaque utilisateur.
function at(dayOffset: number, h: number, m = 0): string {
  return wallTimeToIso(addDaysToKey(todayKey(DEFAULT_TZ), dayOffset), `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, DEFAULT_TZ)
}

export const EVENTS: CalendarEvent[] = [
  { id: 'ev_1',  title: 'Visite avec Lina',           type: 'visite',       start: at(0, 14, 30),  end: at(0, 17, 30),  location: 'À mon domicile', description: 'Visite à mon domicile.\nActivités prévues : jeux, lecture et goûter.', childrenIds: ['c_1'], reminder: '1h', createdAt: at(-4, 10, 30) },
  { id: 'ev_2',  title: 'Appel vidéo',               type: 'appel',        start: at(0, 18, 0),   end: at(0, 18, 30),  location: 'En ligne', childrenIds: ['c_1'], reminder: '15m', createdAt: at(-3, 9, 0) },
  { id: 'ev_3',  title: 'Échange de messages',       type: 'message',      start: at(0, 11, 15),  end: at(0, 11, 45),  location: 'Discussion sur l\'école', childrenIds: ['c_1', 'c_2'], createdAt: at(-2, 8, 0) },
  { id: 'ev_4',  title: 'Appel vidéo avec Noah',     type: 'appel',        start: at(2, 18, 0),   end: at(2, 18, 30),  location: 'En ligne', childrenIds: ['c_2'], reminder: '15m', createdAt: at(-1, 12, 0) },
  { id: 'ev_5',  title: 'Pédiatre — suivi annuel',   type: 'sante',        start: at(4, 10, 0),   end: at(4, 11, 0),   location: 'Cabinet Dr Martin, Cayenne', description: 'Suivi pédiatrique annuel. Apporter le carnet de santé.', childrenIds: ['c_1'], reminder: 'eve20', createdAt: at(-6, 18, 0) },
  { id: 'ev_6',  title: 'Réunion parents-profs',     type: 'ecole',        start: at(5, 18, 0),   end: at(5, 19, 30),  location: 'École Jules Ferry', childrenIds: ['c_1', 'c_2'], reminder: 'eve20', createdAt: at(-8, 9, 15) },
  { id: 'ev_7',  title: 'Judo — Noah',               type: 'activite',     start: at(6, 17, 30),  end: at(6, 18, 30),  location: 'Dojo municipal', childrenIds: ['c_2'], createdAt: at(-8, 9, 20) },
  { id: 'ev_8',  title: 'Sortie piscine',            type: 'sortie',       start: at(8, 15, 0),   end: at(8, 17, 0),   location: 'Centre nautique', childrenIds: ['c_1', 'c_2'], createdAt: at(-5, 14, 0) },
  { id: 'ev_9',  title: 'Échange de messages',       type: 'message',      start: at(10, 11, 15), end: at(10, 11, 45), location: 'Organisation des vacances', reminder: '1h', createdAt: at(-1, 20, 0) },
  { id: 'ev_10', title: 'Médiation familiale',       type: 'rdv',          start: at(13, 14, 0),  end: at(13, 15, 0),  location: 'Cabinet M. Lemoine', reminder: '1h', createdAt: at(-10, 11, 0) },
  { id: 'ev_11', title: 'Anniversaire Lina',          type: 'anniversaire', start: at(16, 15, 0),  end: at(16, 18, 0),  location: 'Domicile', childrenIds: ['c_1'], reminder: 'eve20', createdAt: at(-20, 10, 0) },
  { id: 'ev_12', title: 'Trajet école',              type: 'deplacement',  start: at(-1, 8, 15),  end: at(-1, 8, 45),  childrenIds: ['c_1'], createdAt: at(-3, 19, 0) },
  { id: 'ev_13', title: 'Déjeuner avec les enfants', type: 'repas',        start: at(-2, 12, 0),  end: at(-2, 13, 30), location: 'Chez Mamie', childrenIds: ['c_1', 'c_2'], createdAt: at(-9, 10, 0) },
  { id: 'ev_14', title: 'Café-rencontre',            type: 'autre',        start: at(-3, 10, 0),  end: at(-3, 11, 0),  location: 'Café des Arts', createdAt: at(-4, 9, 0) },
  { id: 'ev_15', title: 'Appel vidéo',               type: 'appel',        start: at(-6, 18, 0),  end: at(-6, 18, 30), location: 'En ligne', childrenIds: ['c_1'], reminder: '15m', createdAt: at(-11, 10, 0) },
  { id: 'ev_16', title: 'Visite avec Lina',           type: 'visite',       start: at(-7, 14, 30), end: at(-7, 17, 30), location: 'Au parc', childrenIds: ['c_1'], reminder: '1h', createdAt: at(-12, 10, 0) },
  { id: 'ev_17', title: 'Échange de messages',       type: 'message',      start: at(-11, 11, 15),end: at(-11, 11, 45),location: 'Point sur la rentrée', reminder: '1h', createdAt: at(-14, 9, 0) },
  // Santé — Lina (c_1) : alimente l'espace Santé de la fiche enfant.
  { id: 'ev_18', title: 'Dentiste — contrôle',       type: 'sante',        start: at(24, 9, 30),  end: at(24, 10, 0),  location: 'Cabinet dentaire des Palmistes', childrenIds: ['c_1'], reminder: 'eve20', createdAt: at(-2, 21, 0) },
  { id: 'ev_19', title: 'Allergologue',              type: 'sante',        start: at(-20, 14, 0), end: at(-20, 14, 45), location: 'Centre hospitalier de Cayenne', description: 'Bilan allergie au pollen, traitement prescrit.', childrenIds: ['c_1'], createdAt: at(-30, 10, 0) },
  { id: 'ev_20', title: 'Pédiatre — fièvre',         type: 'sante',        start: at(-57, 17, 0), end: at(-57, 17, 30), location: 'Cabinet Dr Martin, Cayenne', childrenIds: ['c_1'], createdAt: at(-57, 12, 0) },
]

/**
 * Démo : événements partagés par l'autre parent (Thomas, lié à Lina et Noah dans
 * lib/coparents/demo). Lecture seule, badge « Partagé par Thomas ».
 */
export const FAMILY_DEMO_EVENTS: CalendarEvent[] = [
  { id: 'ev_fam_1', title: 'Week-end chez papa', type: 'visite', start: at(1, 10, 0), end: at(1, 18, 0), location: 'Matoury', childrenIds: ['c_1', 'c_2'], createdAt: at(-5, 19, 0), familyShared: true, sharedBy: { prenom: 'Thomas' } },
  { id: 'ev_fam_2', title: 'Vaccin rappel DTP, Noah', type: 'sante', start: at(9, 16, 30), end: at(9, 17, 0), location: 'Centre de PMI de Matoury', childrenIds: ['c_2'], createdAt: at(-3, 8, 30), familyShared: true, sharedBy: { prenom: 'Thomas' } },
]

export function getEventById(id: string): CalendarEvent | undefined {
  return EVENTS.find(e => e.id === id)
}

// --- Rappels par type (préférences utilisateur, mock) ----------------------

export const DEFAULT_TYPE_REMINDER_ENABLED: Record<EventTypeKey, boolean> = {
  visite: true, appel: true, message: true, sante: true, rdv: true, ecole: true,
  activite: true, sortie: true, repas: false, deplacement: false, anniversaire: true, autre: false,
}

/** Événements concernés par un rappel (rappel explicite ou type activé). */
export function hasReminder(e: CalendarEvent, enabled = DEFAULT_TYPE_REMINDER_ENABLED): boolean {
  if (e.reminder && e.reminder !== 'none') return true
  return enabled[e.type]
}

export const WEEKDAY_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
