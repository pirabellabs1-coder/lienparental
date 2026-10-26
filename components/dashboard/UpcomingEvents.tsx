import Link from 'next/link'
import { CalendarDays, FileHeart, School, Scale, Video } from 'lucide-react'
import { countdownLabel, formatWeekdayDate, type AppEvent } from '@/lib/mock-data'

const TYPE_META: Record<AppEvent['type'], { icon: typeof CalendarDays; tone: string }> = {
  garde: { icon: CalendarDays, tone: 'text-leaf-600' },
  appel: { icon: Video, tone: 'text-night-500' },
  medical: { icon: FileHeart, tone: 'text-orange-500' },
  rdv: { icon: Scale, tone: 'text-iris-500' },
  ecole: { icon: School, tone: 'text-night-500' },
  autre: { icon: CalendarDays, tone: 'text-night-600' },
}

// M03 — Prochains événements (3 prochains, compte à rebours).
export function UpcomingEvents({ events }: { events: AppEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl2 border border-night-100 bg-white p-4 text-[13px] text-night-700 shadow-soft">
        Aucun événement à venir.{' '}
        <Link href="/app/calendrier/nouveau" className="font-semibold text-leaf-600 underline underline-offset-2">
          Planifier un événement
        </Link>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
      {events.slice(0, 3).map((e) => {
        const { icon: Icon, tone } = TYPE_META[e.type]
        return (
          <li key={e.id}>
            <Link
              href={`/app/calendrier/${e.id}`}
              className="flex min-h-[60px] items-center gap-3.5 px-3.5 py-3 transition hover:bg-night-50/50"
            >
              <Icon className={`h-6 w-6 shrink-0 ${tone}`} strokeWidth={1.8} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-night-900">{e.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-night-700">
                  {formatWeekdayDate(e.date)}
                  {e.timeLabel && (
                    <>
                      <span aria-hidden="true"> • </span>
                      <span className="sr-only">, </span>
                      {e.timeLabel}
                    </>
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-leaf-50 px-2 py-1 text-[11px] font-bold text-leaf-600">
                {countdownLabel(e.date)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
