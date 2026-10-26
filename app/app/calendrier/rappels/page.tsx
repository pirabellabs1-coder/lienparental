'use client'

import Link from 'next/link'
import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { EventTypeIcon } from '@/components/calendrier/eventTypeStyles'
import { useClientNow } from '@/components/calendrier/useClientNow'
import {
  dayOf, fmtDateFull, fmtHour, formatCountdown, getEventType, hasReminder, type CalendarEvent,
} from '@/lib/calendrier'
import { useEvents } from '@/lib/data/calendar'

// M06 — Rappels : à venir / passés.
export default function RappelsPage() {
  const now = useClientNow()
  const { data, loading, error, refresh } = useEvents()
  const EVENTS = data ?? []

  const header = (
    <TopBar
      title="Rappels"
      showBack
      backHref="/app/calendrier"
      showBell={false}
      rightSlot={
        <Link
          href="/app/calendrier/parametres"
          aria-label="Paramètres des rappels"
          className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
        >
          <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
        </Link>
      }
    />
  )

  if (error) return <>{header}<ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} /></>
  if (!now || (loading && !data)) return <>{header}<LoadingState compact title="Chargement des rappels" description="" /></>

  const t = now.getTime()
  const withReminder = EVENTS.filter((e) => hasReminder(e))
  const avenir = withReminder
    .filter((e) => new Date(e.start).getTime() >= t)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const passes = withReminder
    .filter((e) => new Date(e.start).getTime() < t)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  return (
    <>
      {header}
      <div className="space-y-6 px-4 pb-6 pt-2">
        <ReminderSection id="avenir" title="À venir" events={avenir} now={t} upcoming empty="Aucun rappel à venir." />
        <ReminderSection id="passes" title="Passés" events={passes} now={t} empty="Aucun rappel passé." />
      </div>
    </>
  )
}

function ReminderSection({ id, title, events, now, upcoming, empty }: {
  id: string; title: string; events: CalendarEvent[]; now: number; upcoming?: boolean; empty: string
}) {
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
                    <span className="sr-only"> ({getEventType(e.type).label})</span>
                  </span>
                  <span className="block truncate text-[11px] text-night-600">
                    {fmtDateFull(dayOf(e.start))} à {fmtHour(e.start)}
                  </span>
                </span>
                {upcoming && (
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-leaf-50 px-2 py-1 text-[10.5px] font-bold text-leaf-700">
                    {formatCountdown(new Date(e.start).getTime() - now)}
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
