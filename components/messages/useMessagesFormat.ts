'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { intlLocale } from '@/lib/i18n/config'
import { addDaysToKey, dayKeyInTz, dayKeyToDate } from '@/lib/tz'
import type { ConversationPreview, ConversationSummary, Participant } from '@/lib/messages'
import { timeLabel } from './format'

/**
 * Libellés de la messagerie dans la langue courante (équivalents traduits de
 * ./format et des aides d'affichage de lib/messages, mêmes règles et même fuseau (celui de l'utilisateur)).
 */
export function useMessagesFormat() {
  const t = useTranslations('messaging.format')
  const locale = useLocale()

  return useMemo(() => {
    const loc = intlLocale(locale)
    const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
      dayKeyToDate(key).toLocaleDateString(loc, { ...opts, timeZone: 'UTC' })
    const decimal = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const list = new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' })

    const displayName = (p: Pick<Participant, 'prenom' | 'nom'>) => `${p.prenom} ${p.nom}`.trim() || t('otherParent')

    const participantsLabel = (people: Participant[]) => {
      if (people.length === 0) return t('conversation')
      if (people.length === 1) return displayName(people[0])
      return list.format(people.map((p) => p.prenom || displayName(p)))
    }

    return {
      intlLocale: loc,
      displayName,
      participantsLabel,
      conversationLabel: (c: Pick<ConversationSummary, 'title' | 'participants'>) => c.title ?? participantsLabel(c.participants),
      previewText: (m: Pick<ConversationPreview, 'body' | 'kind' | 'attachmentName'>) => {
        if (m.kind === 'audio') return t('voiceNote')
        if (m.body) return m.body
        if (m.kind === 'attachment') return m.attachmentName ? t('attachmentNamed', { name: m.attachmentName }) : t('attachment')
        return ''
      },
      /** « Aujourd'hui », « Hier », « Lundi 20 octobre » (année ajoutée si différente). */
      dayLabel: (iso: string, now: Date = new Date()) => {
        const day = dayKeyInTz(iso)
        const today = dayKeyInTz(now)
        if (day === today) return t('today')
        if (day === addDaysToKey(today, -1)) return t('yesterday')
        const s = fmtDay(day, {
          weekday: 'long', day: 'numeric', month: 'long',
          ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}),
        })
        return s.charAt(0).toUpperCase() + s.slice(1)
      },
      /** Heure si aujourd'hui, « Hier », sinon « 26 oct. ». */
      shortStamp: (iso: string, now: Date = new Date()) => {
        const day = dayKeyInTz(iso)
        const today = dayKeyInTz(now)
        if (day === today) return timeLabel(iso)
        if (day === addDaysToKey(today, -1)) return t('yesterday')
        return fmtDay(day, { day: 'numeric', month: 'short' })
      },
      /** « 26 octobre 2026 à 09:30 ». */
      fullStamp: (iso: string) =>
        t('fullStamp', { date: fmtDay(dayKeyInTz(iso), { day: 'numeric', month: 'long', year: 'numeric' }), time: timeLabel(iso) }),
      /** « 25/10/2026 09:30 » (export PDF). */
      numericStamp: (iso: string) =>
        `${fmtDay(dayKeyInTz(iso), { day: '2-digit', month: '2-digit', year: 'numeric' })} ${timeLabel(iso)}`,
      sizeLabel: (bytes: number) => {
        if (bytes < 1024) return t('bytes', { n: String(bytes) })
        if (bytes < 1_048_576) return t('kb', { n: String(Math.round(bytes / 1024)) })
        return t('mb', { n: decimal.format(bytes / 1_048_576) })
      },
    }
  }, [t, locale])
}

export type MessagesFormat = ReturnType<typeof useMessagesFormat>
