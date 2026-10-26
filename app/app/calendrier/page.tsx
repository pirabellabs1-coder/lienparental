'use client'

import { useEffect, useState } from 'react'
import { CalendarHeader, PeriodNav } from '@/components/calendrier/CalendarHeader'
import { MonthGrid } from '@/components/calendrier/MonthGrid'
import { DayEventList } from '@/components/calendrier/DayEventList'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useChildNames } from '@/components/calendrier/useChildNames'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { addMonthsDay, eventsOnDay, fmtDateFull, fmtMonthYear, startOfMonthDay, todayDay } from '@/lib/calendrier'
import { useEvents } from '@/lib/data/calendar'

// M06 — Calendrier, vue mensuelle.
// Supabase : calendar_events (RLS user_id = auth.uid()) via lib/data/calendar ; démo : EVENTS.
export default function CalendrierPage() {
  const now = useClientNow()
  // Jours du calendrier = jours de DEFAULT_TZ (midi UTC), pas ceux du navigateur.
  const today = now ? todayDay(now) : null
  const { data, loading, error, refresh } = useEvents()
  const childNames = useChildNames()
  const EVENTS = data ?? []
  const [month, setMonth] = useState<Date | null>(null)
  const [selected, setSelected] = useState<Date | null>(null)

  useEffect(() => {
    if (!now) return
    const t = todayDay(now)
    setMonth(startOfMonthDay(t))
    setSelected(t)
  }, [now])

  const shift = (n: number) => month && setMonth(addMonthsDay(month, n))

  const select = (d: Date) => {
    setSelected(d)
    if (month && d.getUTCMonth() !== month.getUTCMonth()) setMonth(startOfMonthDay(d))
  }

  return (
    <>
      <CalendarHeader view="mois" />

      {error ? (
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} />
      ) : !month || !selected || (loading && !data) ? (
        <LoadingState compact title="Chargement du calendrier" description="" />
      ) : (
        <div className="px-4 pb-6 pt-3">
          <PeriodNav
            label={fmtMonthYear(month)}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            prevLabel="Mois précédent"
            nextLabel="Mois suivant"
          />
          <div className="mt-2">
            <MonthGrid month={month} selected={selected} onSelect={select} events={EVENTS} today={today ?? undefined} />
          </div>

          <section aria-labelledby="day-title" className="mt-5">
            <h2 id="day-title" aria-live="polite" className="mb-2.5 text-[13px] font-bold text-night-900">
              {fmtDateFull(selected)}
            </h2>
            <DayEventList events={eventsOnDay(EVENTS, selected)} childNames={childNames} />
          </section>
        </div>
      )}
    </>
  )
}
