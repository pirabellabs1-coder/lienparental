import Link from 'next/link'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** En-tête « Calendrier » + cloche + pastille « Rappels », puis segmenté Mois / Semaine. */
export function CalendarHeader({ view }: { view: 'mois' | 'semaine' }) {
  const seg = (active: boolean) =>
    cn(
      'flex h-10 items-center justify-center rounded-md text-[13px] transition-colors',
      active ? 'bg-leaf-500 font-bold text-white shadow-soft' : 'font-semibold text-night-900 hover:bg-night-50',
    )
  return (
    <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <header className="flex h-12 items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight text-night-900">Calendrier</h1>
        <div className="-mr-1 flex items-center gap-1">
          <Link
            href="/app/notifications"
            aria-label="Notifications"
            className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Bell aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Link
            href="/app/garde"
            className="inline-flex h-11 items-center rounded-full border border-night-100 bg-white px-4 text-[13px] font-bold text-night-900 shadow-soft hover:bg-night-50"
          >
            Garde
          </Link>
          <Link
            href="/app/calendrier/rappels"
            className="inline-flex h-11 items-center rounded-full border border-night-100 bg-white px-4 text-[13px] font-bold text-night-900 shadow-soft hover:bg-night-50"
          >
            Rappels
          </Link>
        </div>
      </header>

      <nav aria-label="Vue du calendrier" className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-night-100 bg-white p-1">
        <Link href="/app/calendrier" aria-current={view === 'mois' ? 'page' : undefined} className={seg(view === 'mois')}>
          Mois
        </Link>
        <Link href="/app/calendrier/semaine" aria-current={view === 'semaine' ? 'page' : undefined} className={seg(view === 'semaine')}>
          Semaine
        </Link>
      </nav>
    </div>
  )
}

/** Ligne ‹ Mai 2024 › */
export function PeriodNav({
  label, onPrev, onNext, prevLabel, nextLabel,
}: { label: string; onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string }) {
  const btn = 'grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50'
  return (
    <div className="flex items-center justify-between">
      <button type="button" onClick={onPrev} aria-label={prevLabel} className={cn(btn, '-ml-2')}>
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>
      <p aria-live="polite" className="text-[15px] font-bold text-night-900 first-letter:uppercase">{label}</p>
      <button type="button" onClick={onNext} aria-label={nextLabel} className={cn(btn, '-mr-2')}>
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  )
}
