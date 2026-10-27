'use client'

import Link from 'next/link'
import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { EventTypeIcon } from '@/components/calendrier/eventTypeStyles'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import {
  dayOf, hasReminder, type CalendarEvent,
} from '@/lib/calendrier'
import { useEvents } from '@/lib/data/calendar'

// M06 — Rappels : à venir / passés.
export default function RappelsPage() {
  const t = useTranslations('calendar')
  const now = useClientNow()
  const { data, loading, error, refresh } = useEvents()
  const EVENTS = data ?? []

  const header = (
    <TopBar
      title={t('reminders.title')}
      showBack
      backHref="/app/calendrier"
      showBell={false}
      rightSlot={
        <Link
          href="/app/calendrier/parametres"
          aria-label={t('reminders.settings')}
          className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
        >
          <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
        </Link>
      }
    />
  )

  if (error) return <>{header}<ErrorState compact description={error.message} primary={{ label: t('common.retry'), onClick: () => void refresh() }} /></>
  if (!now || (loading && !data)) return <>{header}<LoadingState compact title={t('reminders.loading')} description="" /></>

  const nowMs = now.getTime()
  const withReminder = EVENTS.filter((e) => hasReminder(e))
  const avenir = withReminder
    .filter((e) => new Date(e.start).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const passes = withReminder
    .filter((e) => new Date(e.start).getTime() < nowMs)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  return (
    <>
      {header}
      <div className="space-y-6 px-4 pb-6 pt-2">
        <ReminderSection id="avenir" title={t('reminders.upcoming')} events={avenir} now={nowMs} upcoming empty={t('reminders.emptyUpcoming')} />
        <ReminderSection id="passes" title={t('reminders.past')} events={passes} now={nowMs} empty={t('reminders.emptyPast')} />
      </div>
    </>
  )
}

function ReminderSection({ id, title, events, now, upcoming, empty }: {
  id: string; title: string; events: CalendarEvent[]; now: number; upcoming?: boolean; empty: string
}) {
  const t = useTranslations('calendar.common')
  const f = useCalFormat()
  return (
    <section aria-labelledby={`r-${id}`}>
      <h2 id={`r-${id}`} className="mb-2.5 text-[13px] font-bold text-night-900">{title}</h2>
      {events.length === 0 ? (
        <p className="rounded-xl border border-night-100 px-4 py-4 text-center text-xs text-night-600">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/app/calendrier/${e.id}`}
                className="flex items-center gap-3 rounded-xl border border-night-100 bg-white py-3 pl-3 pr-2 shadow-soft transition-colors hover:bg-night-50/40"
              >
                <EventTypeIcon type={e.type} size="md" className="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-night-900">
                    {e.title}
                    <span className="sr-only"> ({f.typeLabel(e.type)})</span>
                  </span>
                  <span className="block truncate text-[11px] text-night-600">
                    {t('dateAtTime', { date: f.dateFull(dayOf(e.start)), time: f.hour(e.start) })}
                  </span>
                </span>
                {upcoming && (
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-leaf-50 px-2 py-1 text-[10.5px] font-bold text-leaf-700">
                    {f.countdown(new Date(e.start).getTime() - now)}
                  </span>
                )}
                <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
