import Link from 'next/link'
import { cn } from '@/lib/cn'
import { fmtHourRange, getEventType, type CalendarEvent } from '@/lib/calendrier'
import { EventTypeIcon, typeStyle } from './eventTypeStyles'
import { SharedByBadge } from '@/components/famille/SharedByBadge'

/** Liste des événements d'un jour (maquette vue mensuelle). `childNames` : ids → « Lina, Noah ». */
export function DayEventList({ events, childNames }: { events: CalendarEvent[]; childNames?: (ids?: string[]) => string }) {
  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-night-100 bg-white px-4 py-5 text-center text-xs text-night-600">
        Aucun événement ce jour-là.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-night-100 rounded-2xl border border-night-100 bg-white shadow-soft">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/app/calendrier/${e.id}`}
            className="flex items-center gap-3.5 px-3.5 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-night-50/40"
          >
            <EventTypeIcon type={e.type} size="md" className="rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] tabular-nums text-night-600">{fmtHourRange(e.start, e.end)}</span>
              <span className="block truncate text-[13px] font-bold text-night-900">
                {e.title}
                <span className="sr-only"> ({getEventType(e.type).label})</span>
              </span>
              <EventMeta kids={childNames?.(e.childrenIds)} location={e.location} className="text-[11px] text-night-600" />
              {e.sharedBy && <SharedByBadge prenom={e.sharedBy.prenom} className="mt-1" />}
            </span>
            <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', typeStyle(e.type).dot)} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** « Lina · Cabinet Dr Martin » — l'enfant concerné en premier (rendez-vous santé liés à l'enfant). */
export function EventMeta({ kids, location, className }: { kids?: string; location?: string; className?: string }) {
  if (!kids && !location) return null
  return (
    <span className={cn('block truncate', className)}>
      {kids && (
        <span className="font-semibold text-night-800">
          <span className="sr-only">Enfant : </span>
          {kids}
        </span>
      )}
      {kids && location && <span aria-hidden="true"> · </span>}
      {kids && location && <span className="sr-only">, </span>}
      {location}
    </span>
  )
}
