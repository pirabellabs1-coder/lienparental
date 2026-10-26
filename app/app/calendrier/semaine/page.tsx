'use client'

import { useEffect, useState } from 'react'
import { CalendarHeader, PeriodNav } from '@/components/calendrier/CalendarHeader'
import { DayTimeline, WeekStrip } from '@/components/calendrier/WeekGrid'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useChildNames } from '@/components/calendrier/useChildNames'
import { Fab } from '@/components/journal/Fab'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { addDaysDay, fmtDayLong, getWeekDays, todayDay } from '@/lib/calendrier'
import { useEvents } from '@/lib/data/calendar'

// M06 — Vue hebdomadaire (jours = DEFAULT_TZ, Dates à midi UTC) : bandeau de la semaine + grille horaire 08h → 20h du jour choisi.
function weekLabel(ref: Date): string {
  const days = getWeekDays(ref)
  const first = days[0]
  const last = days[6]
  const end = last.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (first.getUTCMonth() === last.getUTCMonth()) return `${first.getUTCDate()} – ${end}`
  return `${first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${end}`
}

export default function CalendrierSemainePage() {
  const now = useClientNow()
  const today = now ? todayDay(now) : null
  const { data, loading, error, refresh } = useEvents()
  const childNames = useChildNames()
  const EVENTS = data ?? []
  const [selected, setSelected] = useState<Date | null>(null)

  useEffect(() => { if (now) setSelected(todayDay(now)) }, [now])

  const shift = (n: number) => {
    if (selected) setSelected(addDaysDay(selected, n * 7))
  }

  return (
    <>
      <CalendarHeader view="semaine" />

      {error ? (
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} />
      ) : !selected || (loading && !data) ? (
        <LoadingState compact title="Chargement du calendrier" description="" />
      ) : (
        <div className="px-4 pb-4 pt-3">
          <PeriodNav
            label={weekLabel(selected)}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            prevLabel="Semaine précédente"
            nextLabel="Semaine suivante"
          />
          <div className="mt-1">
            <WeekStrip weekRef={selected} selected={selected} onSelect={setSelected} today={today ?? undefined} />
          </div>
          <section
            aria-label={fmtDayLong(selected)}
            className="mt-4"
          >
            <DayTimeline day={selected} events={EVENTS} childNames={childNames} />
          </section>
        </div>
      )}

      <Fab href="/app/calendrier/nouveau" label="Ajouter un événement" />
    </>
  )
}
