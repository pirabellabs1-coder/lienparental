'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import {
  eventsOnDay, getWeekDays, isSameDay, minutesOfDay, toDateKey,
  type CalendarEvent,
} from '@/lib/calendrier'
import { typeIcon, typeStyle } from './eventTypeStyles'
import { EventMeta } from './DayEventList'
import { useCalFormat } from './useCalFormat'
import { SharedByBadge } from '@/components/famille/SharedByBadge'

/** Bandeau LUN → DIM de la semaine ; jour sélectionné en cercle vert plein. */
export function WeekStrip({ weekRef, selected, onSelect, today }: {
  weekRef: Date; selected: Date; onSelect: (d: Date) => void; today?: Date
}) {
  const f = useCalFormat()
  const days = getWeekDays(weekRef)
  return (
    <div className="grid grid-cols-7">
      {days.map((d, i) => {
        const isSel = isSameDay(d, selected)
        const isToday = today ? isSameDay(d, today) : false
        return (
          <button
            key={toDateKey(d)}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={isSel}
            aria-current={isToday ? 'date' : undefined}
            aria-label={f.dayLong(d)}
            className="flex min-h-[56px] flex-col items-center gap-1 rounded-lg pt-1 hover:bg-night-50/60"
          >
            <span aria-hidden="true" className="text-[10px] font-semibold uppercase tracking-wide text-night-500 md:text-[11px]">
              {f.weekdays[i].short}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full text-[13px] tabular-nums md:h-9 md:w-9 md:text-sm',
                isSel ? 'bg-leaf-500 font-bold text-white' : isToday ? 'font-extrabold text-leaf-600' : 'font-medium text-night-900',
              )}
            >
              {d.getUTCDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const HOUR_START = 8
const HOUR_END = 20
const LABELS = [8, 10, 12, 14, 16, 18, 20]

/** Grille horaire 08h → 20h du jour sélectionné, blocs colorés par type. */
export function DayTimeline({ day, events, childNames }: { day: Date; events: CalendarEvent[]; childNames?: (ids?: string[]) => string }) {
  const t = useTranslations('calendar.common')
  const f = useCalFormat()
  const list = eventsOnDay(events, day)
  const span = (HOUR_END - HOUR_START) * 60
  const pct = (iso: string) => {
    // Heure murale DEFAULT_TZ (pas celle du navigateur).
    const m = minutesOfDay(iso) - HOUR_START * 60
    return (Math.max(0, Math.min(span, m)) / span) * 100
  }

  return (
    <div className="grid grid-cols-[2.5rem_1fr]">
      <div aria-hidden="true" className="relative h-[420px] md:h-[600px]">
        {LABELS.map((h) => (
          <span
            key={h}
            className="absolute left-0 -translate-y-1/2 text-[10px] font-medium tabular-nums text-night-500"
            style={{ top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%` }}
          >
            {f.hourTick(h)}
          </span>
        ))}
      </div>

      <div className="relative h-[420px] border-l border-night-100 md:h-[600px]">
        {LABELS.map((h) => (
          <span
            key={h}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-night-50"
            style={{ top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%` }}
          />
        ))}

        {list.length === 0 && (
          <p className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center text-xs text-night-500">
            {t('noEventsDay')}
          </p>
        )}

        <ul>
          {list.map((e) => {
            const s = typeStyle(e.type)
            const Icon = typeIcon(e.type)
            const top = pct(e.start)
            const height = Math.max(pct(e.end) - top, 0)
            // Événement court (< 2 h, hauteur ≈ min-h) : horaire + titre seulement, sur deux lignes
            // lisibles ; le détail (enfants, lieu, partage) n'est plus coupé à mi-hauteur.
            const compact = minutesOfDay(e.end) - minutesOfDay(e.start) < 120
            return (
              <li key={e.id}>
                <Link
                  href={`/app/calendrier/${e.id}`}
                  className={cn('absolute left-2 right-1 flex min-h-[46px] gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 transition-transform motion-safe:hover:-translate-y-px', s.bg)}
                  style={{ top: `${top}%`, height: `${height}%` }}
                  title={`${f.hourRange(e.start, e.end)} · ${e.title}`}
                >
                  <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', s.icon)} strokeWidth={1.9} />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[10px] font-semibold leading-[15px] tabular-nums', s.text)}>{f.hourRange(e.start, e.end)}</span>
                    <span className={cn('block truncate text-[11.5px] font-bold leading-[16px]', s.text)}>
                      {e.title}
                      <span className="sr-only"> ({f.typeLabel(e.type)})</span>
                    </span>
                    {compact ? (
                      // Détail toujours disponible pour les lecteurs d'écran (et sur la fiche de l'événement).
                      <span className="sr-only">
                        <EventMeta kids={childNames?.(e.childrenIds)} location={e.location} />
                      </span>
                    ) : (
                      <>
                        <EventMeta kids={childNames?.(e.childrenIds)} location={e.location} className="text-[10.5px] text-night-700" />
                        {e.sharedBy && <SharedByBadge prenom={e.sharedBy.prenom} className="mt-0.5" />}
                      </>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
