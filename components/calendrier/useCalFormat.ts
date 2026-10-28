'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  capitalize, fmtHourLocale, fmtHourTickLocale, fmtWallTime, getWeekDays,
  type EventTypeKey, type ReminderKey,
} from '@/lib/calendrier'
import { intlLocale } from '@/lib/i18n/config'

// Formatage localisé du calendrier (fr / en / pt). Les jours sont des Dates à midi UTC
// (lib/calendrier) : on formate toujours avec `timeZone: 'UTC'`. Les heures murales viennent
// de DEFAULT_TZ (lib/calendrier → fmtTime). Heures : « 14h30 » (fr), « 2:30 PM » (en), « 14:30 » (pt).

const UTC = { timeZone: 'UTC' } as const
/** Lundi 1er janvier 2024, midi UTC : base des noms de jours (lundi en premier). */
const MONDAY_REF = Date.UTC(2024, 0, 1, 12)
const DAY_MS = 86_400_000

export type WeekdayName = { short: string; long: string }

/** Noms de jours localisés, lundi en premier (« Lun » … « Dim » en français). */
export function weekdayNames(locale: string): WeekdayName[] {
  const loc = intlLocale(locale)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(MONDAY_REF + i * DAY_MS)
    const short = d.toLocaleDateString(loc, { weekday: 'short', ...UTC }).replace(/\.$/, '')
    return { short: capitalize(short), long: d.toLocaleDateString(loc, { weekday: 'long', ...UTC }) }
  })
}

/** Heure murale "HH:mm" au format de la langue (fr « 14h30 », en « 2:30 PM », pt « 14:30 »). */
export function localWallTime(hhmm: string, locale: string): string {
  return fmtWallTime(hhmm, locale)
}

export function useCalFormat() {
  const locale = useLocale()
  const t = useTranslations('calendar')

  return useMemo(() => {
    const loc = intlLocale(locale)
    const en = locale === 'en'
    const day = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(loc, { ...o, ...UTC })
    const hour = (iso: string) => fmtHourLocale(iso, locale)

    return {
      locale,
      weekdays: weekdayNames(locale),
      monthYear: (d: Date) => day(d, { month: 'long', year: 'numeric' }),
      dayLong: (d: Date) => day(d, { weekday: 'long', day: 'numeric', month: 'long' }),
      /** « Dimanche 12 mai 2024 » */
      dateFull: (d: Date) => capitalize(day(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      /** « 12 mai 2024 » */
      dateMedium: (d: Date) => day(d, { day: 'numeric', month: 'long', year: 'numeric' }),
      /** « 14h30 » (fr), « 2:30 PM » (en), « 14:30 » (pt) */
      hour,
      /** « 14h30 - 17h30 » (fr), « 2:30 PM – 5:30 PM » (en), « 14:30 – 17:30 » (pt) */
      hourRange: (start: string, end: string) => (locale === 'fr' ? `${hour(start)} - ${hour(end)}` : `${hour(start)} – ${hour(end)}`),
      /** Graduation de la grille horaire : « 08h » (fr), « 8 AM » (en), « 08:00 » (pt). */
      hourTick: (h: number) => fmtHourTickLocale(h, locale),
      /** « 6 – 12 mai 2024 » / « 29 avr. – 5 mai 2024 » */
      weekRange: (ref: Date) => {
        const days = getWeekDays(ref)
        const first = days[0]
        const last = days[6]
        if (en) {
          return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', ...UTC }).formatRange(first, last)
        }
        const end = day(last, { day: 'numeric', month: 'long', year: 'numeric' })
        if (first.getUTCMonth() === last.getUTCMonth()) return `${first.getUTCDate()} – ${end}`
        return `${day(first, { day: 'numeric', month: 'short' })} – ${end}`
      },
      typeLabel: (key: EventTypeKey) => t(`types.${key}`),
      reminderLabel: (key: ReminderKey) => t(`reminderOptions.${key}`),
      /** « Dans 2 jours », « Dans 1 h », « Dans 15 min », « Passé », « Imminent » */
      countdown: (ms: number) => {
        if (ms <= 0) return t('countdown.past')
        const min = Math.floor(ms / 60_000)
        const h = Math.floor(min / 60)
        const d = Math.floor(h / 24)
        if (d >= 1) return t('countdown.days', { count: d })
        if (h >= 1) return t('countdown.hours', { count: h })
        if (min >= 1) return t('countdown.minutes', { count: min })
        return t('countdown.imminent')
      },
    }
  }, [locale, t])
}
