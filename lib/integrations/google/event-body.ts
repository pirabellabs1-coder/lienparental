/**
 * Google Agenda : traduction d'un événement Lien Parental en corps d'API (module pur, testé).
 */
import { appUrl } from '@/lib/auth/redirect'
import { parseRule } from '@/lib/recurrence'
import { DEFAULT_TZ, timeInTz, dayKeyInTz } from '@/lib/tz'
import type { GoogleEventBody } from './calendar-api'
import type { ConnectionRow } from './store'
import { GENERIC_TITLES, type DbEventType } from './types'

export type EventRow = {
  id: string
  type: DbEventType
  titre: string
  description: string | null
  lieu: string | null
  start_at: string
  end_at: string | null
  reminder_minutes: number | null
  deleted_at: string | null
  /** Série (0660) : règle RFC 5545 et fuseau de l'heure murale. */
  rrule?: string | null
  tzid?: string | null
}

/** Une série « vacances scolaires » (dates publiées, pas de RRULE) ne part pas vers Google. */
export function isGoogleSyncable(ev: Pick<EventRow, 'rrule'>): boolean {
  return !ev.rrule || parseRule(ev.rrule)?.kind === 'rrule'
}

/** Occurrence retirée → EXDATE dans le fuseau de la série (« 20261105T180000 »). */
function exdate(iso: string, tz: string): string {
  return `${dayKeyInTz(iso, tz).replace(/-/g, '')}T${timeInTz(iso, tz).replace(':', '')}00`
}

/**
 * Corps d'événement Google Agenda. Les instants restent exacts (ISO UTC) ; `timeZone` = fuseau de
 * l'utilisateur, pour que Google affiche et répète l'événement dans son fuseau.
 */
export function toGoogleEvent(ev: EventRow, conn: Pick<ConnectionRow, 'mask_mode'>, tz: string = DEFAULT_TZ, removed: string[] = []): GoogleEventBody {
  const masked = conn.mask_mode === 'all' || (conn.mask_mode === 'sensitive' && ev.type === 'sante')
  const end = ev.end_at ?? new Date(Date.parse(ev.start_at) + 3_600_000).toISOString()
  const reminder = ev.reminder_minutes != null ? Math.min(Math.max(0, ev.reminder_minutes), 40_320) : null
  const footer = 'Ajouté depuis Lien Parental.'
  // Série : répétée par Google dans le fuseau de la série (18h à Cayenne reste 18h à Cayenne).
  const rule = ev.rrule ? parseRule(ev.rrule) : null
  const seriesTz = rule && ev.tzid ? ev.tzid : tz
  const recurrence = rule?.kind === 'rrule'
    ? [`RRULE:${ev.rrule}`, ...(removed.length ? [`EXDATE;TZID=${seriesTz}:${removed.map((r) => exdate(r, seriesTz)).join(',')}`] : [])]
    : undefined
  return {
    summary: masked ? GENERIC_TITLES[ev.type] : ev.titre.slice(0, 250),
    // Masqué : ni description ni lieu ne quittent l'application.
    description: masked ? 'Détails disponibles dans Lien Parental.' : [ev.description?.trim(), footer].filter(Boolean).join('\n\n'),
    ...(masked || !ev.lieu ? {} : { location: ev.lieu.slice(0, 200) }),
    start: { dateTime: ev.start_at, timeZone: seriesTz },
    end: { dateTime: end, timeZone: seriesTz },
    ...(recurrence ? { recurrence } : {}),
    reminders: reminder != null ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminder }] } : { useDefault: false, overrides: [] },
    extendedProperties: { private: { lienParentalId: ev.id } },
    source: { title: 'Lien Parental', url: `${appUrl()}/app/calendrier/${ev.id}` },
    visibility: masked ? 'private' : 'default',
    status: 'confirmed',
  }
}
