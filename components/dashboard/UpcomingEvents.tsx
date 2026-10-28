'use client'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarDays, FileHeart, School, Scale, Video } from 'lucide-react'
import { daysUntil, type AppEvent } from '@/lib/mock-data'
import { intlLocale } from '@/lib/i18n/config'

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
  const t = useTranslations('dash')
  const locale = useLocale()
  // « Mardi 27 octobre 2026 » / « Tuesday, October 27, 2026 » selon la langue.
  const weekdayDate = (iso: string) => {
    const s = new Date(iso).toLocaleDateString(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const countdown = (iso: string) => {
    const d = daysUntil(iso)
    if (d === 0) return t('countdown.today')
    if (d === 1) return t('countdown.tomorrow')
    if (d > 1) return t('countdown.inDays', { n: d })
    if (d === -1) return t('countdown.yesterday')
    return t('countdown.daysAgo', { n: Math.abs(d) })
  }
  if (events.length === 0) {
    return (
      <div className="rounded-xl2 border border-night-100 bg-white p-4 text-[13px] text-night-700 shadow-soft">
        {t('noEvents')}{' '}
        <Link href="/app/calendrier/nouveau" className="font-semibold text-leaf-600 underline underline-offset-2">
          {t('planEvent')}
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
                <p className="line-clamp-2 break-words text-[13.5px] font-bold text-night-900">{e.title}</p>
                <p className="mt-0.5 break-words text-[12px] text-night-700">
                  {weekdayDate(e.date)}
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
                {countdown(e.date)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
