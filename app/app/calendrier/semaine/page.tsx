'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarHeader, PeriodNav } from '@/components/calendrier/CalendarHeader'
import { DayTimeline, WeekStrip } from '@/components/calendrier/WeekGrid'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useChildNames } from '@/components/calendrier/useChildNames'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { Fab } from '@/components/journal/Fab'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { addDaysDay, todayDay } from '@/lib/calendrier'
import { useEvents } from '@/lib/data/calendar'

// M06 — Vue hebdomadaire (jours = DEFAULT_TZ, Dates à midi UTC) : bandeau de la semaine + grille horaire 08h → 20h du jour choisi.
// Libellé de la semaine : useCalFormat().weekRange.

export default function CalendrierSemainePage() {
  const t = useTranslations('calendar')
  const f = useCalFormat()
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
        <ErrorState compact description={error.message} primary={{ label: t('common.retry'), onClick: () => void refresh() }} />
      ) : !selected || (loading && !data) ? (
        <LoadingState compact title={t('common.loadingCalendar')} description="" />
      ) : (
        <div className="px-4 pb-4 pt-3">
          <PeriodNav
            label={f.weekRange(selected)}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            prevLabel={t('common.prevWeek')}
            nextLabel={t('common.nextWeek')}
          />
          <div className="mt-1">
            <WeekStrip weekRef={selected} selected={selected} onSelect={setSelected} today={today ?? undefined} />
          </div>
          <section
            aria-label={f.dayLong(selected)}
            className="mt-4"
          >
            <DayTimeline day={selected} events={EVENTS} childNames={childNames} />
          </section>
        </div>
      )}

      <Fab href="/app/calendrier/nouveau" label={t('week.addEvent')} />
    </>
  )
}
