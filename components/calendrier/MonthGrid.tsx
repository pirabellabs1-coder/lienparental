'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import {
  eventsOnDay, getMonthMatrix, isSameDay, toDateKey, type CalendarEvent,
} from '@/lib/calendrier'
import { typeStyle } from './eventTypeStyles'
import { useCalFormat } from './useCalFormat'

// Jours = Dates à midi UTC (lib/calendrier → dayOf / todayDay), lues en UTC.
type Props = {
  month: Date
  selected: Date
  onSelect: (d: Date) => void
  events: CalendarEvent[]
  /** Date du jour (fournie par la page pour éviter un écart serveur/client) */
  today?: Date
}

/** Grille mensuelle épurée : jours, pastilles colorées, jour sélectionné en cercle vert plein. */
export function MonthGrid({ month, selected, onSelect, events, today }: Props) {
  const t = useTranslations('calendar.month')
  const f = useCalFormat()
  const matrix = getMonthMatrix(month, true)
  const currentMonth = month.getUTCMonth()

  return (
    <div>
      <div aria-hidden="true" className="grid grid-cols-7 pb-1.5">
        {f.weekdays.map(({ short: d }) => (
          <span key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-night-500 md:text-[11px]">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {matrix.flat().map((day) => {
          const inMonth = day.getUTCMonth() === currentMonth
          const isSelected = isSameDay(day, selected)
          const isToday = today ? isSameDay(day, today) : false
          const dayEvents = eventsOnDay(events, day)
          const label = f.dayLong(day) + (dayEvents.length ? t('dayEvents', { count: dayEvents.length }) : '')

          return (
            <button
              key={toDateKey(day)}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={label}
              className="flex h-12 flex-col items-center justify-start gap-[3px] rounded-lg pt-1 transition-colors hover:bg-night-50/60 md:h-16"
            >
              <span
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full text-[13px] tabular-nums md:h-9 md:w-9 md:text-sm',
                  isSelected
                    ? 'bg-leaf-500 font-bold text-white'
                    : inMonth
                      ? cn('text-night-900', isToday ? 'font-extrabold text-leaf-600' : 'font-medium')
                      : 'font-medium text-night-300',
                )}
              >
                {day.getUTCDate()}
              </span>
              <span aria-hidden="true" className="flex h-1 items-center gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <span key={e.id} className={cn('h-1 w-1 rounded-full', typeStyle(e.type).dot)} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
