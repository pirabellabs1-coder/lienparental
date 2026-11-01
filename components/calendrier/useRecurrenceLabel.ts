'use client'

import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { weekdayNames } from '@/components/calendrier/useCalFormat'
import { intlLocale } from '@/lib/i18n/config'
import { WEEKDAYS, expandSeries, parseRule } from '@/lib/recurrence'
import { dayKeyInTz, fmtDayKey } from '@/lib/tz'

/**
 * Phrase lisible d'une règle de répétition (« Toutes les 2 semaines : vendredi, jusqu'au 30 juin 2027 »).
 * `start` : début de la série (jour du mois pour « le 15 », jour de semaine par défaut). '' si la règle est illisible.
 */
export function useRecurrenceLabel() {
  const t = useTranslations('calendar.recurrence')
  const locale = useLocale()
  return useCallback((raw: string, tz: string, start: string): string => {
    const rule = parseRule(raw)
    if (!rule) return ''
    const names = weekdayNames(locale)
    const startDay = dayKeyInTz(start, tz)
    const weekdayIdx = (startDay ? (new Date(`${startDay}T12:00:00Z`).getUTCDay() + 6) % 7 : 0)
    let text: string
    if (rule.kind === 'holidays') {
      text = t('summary.holidays', { zone: t(`zones.${rule.zone}`), part: t(`parts.${rule.part}`), years: t(`yearsOptions.${rule.years}`) })
    } else if (rule.freq === 'DAILY') {
      text = t('summary.daily', { count: rule.interval })
    } else if (rule.freq === 'WEEKLY') {
      const days = (rule.byDay?.length ? rule.byDay : [WEEKDAYS[weekdayIdx]]).map((d) => names[WEEKDAYS.indexOf(d)].long)
      text = t('summary.weekly', { count: rule.interval, days: new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'conjunction' }).format(days) })
    } else if (rule.freq === 'MONTHLY' && rule.byNthDay) {
      const nth = t(`nth.${rule.byNthDay.pos === -1 ? 'last' : rule.byNthDay.pos}`)
      text = t('summary.monthlyNth', { count: rule.interval, nth, weekday: names[WEEKDAYS.indexOf(rule.byNthDay.day)].long })
    } else if (rule.freq === 'MONTHLY') {
      text = t('summary.monthlyDay', { count: rule.interval, day: rule.byMonthDay ?? Number(startDay.slice(8, 10)) })
    } else {
      text = t('summary.yearly', { count: rule.interval })
    }
    if (rule.until) {
      // Jour de la DERNIÈRE occurrence (une série arrêtée « avant le 20 » ne doit pas afficher « jusqu'au 20 »).
      const occs = expandSeries({ start, end: start, tz, rule }, start, new Date(Date.parse(rule.until) + 1000).toISOString())
      const lastDay = occs.length ? dayKeyInTz(occs[occs.length - 1].start, tz) : dayKeyInTz(rule.until, tz)
      const date = fmtDayKey(lastDay, { day: 'numeric', month: 'long', year: 'numeric' }, locale)
      return t('summary.until', { rule: text, date })
    }
    if (rule.kind === 'rrule' && rule.count) return t('summary.count', { rule: text, count: rule.count })
    return text
  }, [t, locale])
}
