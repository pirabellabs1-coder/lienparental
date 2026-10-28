/**
 * Google Agenda : traduction d'un événement Lien Parental en corps d'API (module pur, testé).
 */
import { appUrl } from '@/lib/auth/redirect'
import { DEFAULT_TZ } from '@/lib/tz'
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
}

/**
 * Corps d'événement Google Agenda. Les instants restent exacts (ISO UTC) ; `timeZone` = fuseau de
 * l'utilisateur, pour que Google affiche et répète l'événement dans son fuseau.
 */
export function toGoogleEvent(ev: EventRow, conn: Pick<ConnectionRow, 'mask_mode'>, tz: string = DEFAULT_TZ): GoogleEventBody {
  const masked = conn.mask_mode === 'all' || (conn.mask_mode === 'sensitive' && ev.type === 'sante')
  const end = ev.end_at ?? new Date(Date.parse(ev.start_at) + 3_600_000).toISOString()
  const reminder = ev.reminder_minutes != null ? Math.min(Math.max(0, ev.reminder_minutes), 40_320) : null
  const footer = 'Ajouté depuis Lien Parental.'
  return {
    summary: masked ? GENERIC_TITLES[ev.type] : ev.titre.slice(0, 250),
    // Masqué : ni description ni lieu ne quittent l'application.
    description: masked ? 'Détails disponibles dans Lien Parental.' : [ev.description?.trim(), footer].filter(Boolean).join('\n\n'),
    ...(masked || !ev.lieu ? {} : { location: ev.lieu.slice(0, 200) }),
    start: { dateTime: ev.start_at, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
    reminders: reminder != null ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminder }] } : { useDefault: false, overrides: [] },
    extendedProperties: { private: { lienParentalId: ev.id } },
    source: { title: 'Lien Parental', url: `${appUrl()}/app/calendrier/${ev.id}` },
    visibility: masked ? 'private' : 'default',
    status: 'confirmed',
  }
}
