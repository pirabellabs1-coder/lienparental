// Sélecteur de période : liens (fonctionne sans JavaScript) + formulaire GET
// pour une période personnalisée. Export CSV de la période affichée.
import Link from 'next/link'
import { CalendarRange, Download } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MAX_CUSTOM_DAYS, MIN_DAY, PERIOD_LABELS, periodSearch } from '@/lib/admin/stats/period'
import type { Period, PeriodKey } from '@/lib/admin/stats/types'

const PRESETS: Exclude<PeriodKey, 'perso'>[] = ['7j', '30j', '90j', '12m']

const chip = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'

export function PeriodPicker({ period, error, today, customRequested, typed }: { period: Period; error: string | null; today: string; customRequested: boolean; typed?: { du?: string; au?: string } }) {
  // En cas d'erreur, on réaffiche les dates saisies (et non la période de repli).
  const keepTyped = Boolean(error && customRequested)
  const customOpen = period.key === 'perso' || customRequested
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <nav aria-label="Période affichée">
          <ul className="flex flex-wrap gap-2">
            {PRESETS.map((k) => {
              const active = period.key === k
              return (
                <li key={k}>
                  <Link
                    href={`/admin?periode=${k}`}
                    aria-current={active ? 'page' : undefined}
                    scroll={false}
                    className={cn(chip, active ? 'bg-night-900 text-white' : 'border border-night-200 bg-white text-night-800 hover:bg-night-50')}
                  >
                    {PERIOD_LABELS[k]}
                  </Link>
                </li>
              )
            })}
            <li>
              <details className="group relative" open={customOpen}>
                <summary
                  className={cn(chip, 'cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden', period.key === 'perso' ? 'bg-night-900 text-white' : 'border border-night-200 bg-white text-night-800 hover:bg-night-50')}
                >
                  <CalendarRange className="h-4 w-4" aria-hidden="true" />
                  Personnalisée
                </summary>
                <form method="get" action="/admin" className="mt-2 flex flex-wrap items-end gap-3 rounded-xl2 border border-night-100 bg-white p-4 shadow-card sm:absolute sm:left-0 sm:z-20 sm:w-max">
                  <input type="hidden" name="periode" value="perso" />
                  <div>
                    <label htmlFor="periode-du" className="block text-xs font-semibold text-night-800">Du</label>
                    <input
                      id="periode-du"
                      name="du"
                      type="date"
                      required
                      min={MIN_DAY}
                      max={today}
                      defaultValue={keepTyped ? typed?.du ?? '' : period.fromDay}
                      aria-describedby={error && customRequested ? 'periode-erreur' : 'periode-aide'}
                      aria-invalid={error && customRequested ? true : undefined}
                      className="mt-1 h-11 rounded-xl border border-night-200 px-3 text-sm text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="periode-au" className="block text-xs font-semibold text-night-800">Au</label>
                    <input
                      id="periode-au"
                      name="au"
                      type="date"
                      required
                      min={MIN_DAY}
                      max={today}
                      defaultValue={keepTyped ? typed?.au ?? '' : period.toDay}
                      aria-describedby={error && customRequested ? 'periode-erreur' : 'periode-aide'}
                      aria-invalid={error && customRequested ? true : undefined}
                      className="mt-1 h-11 rounded-xl border border-night-200 px-3 text-sm text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
                    />
                  </div>
                  <button type="submit" className={cn(chip, 'bg-leaf-500 text-white hover:bg-leaf-600')}>Appliquer</button>
                  <p id="periode-aide" className="w-full text-xs text-night-600">Jusqu’à {Math.floor(MAX_CUSTOM_DAYS / 365)} ans, comparée à la période de même durée qui précède.</p>
                </form>
              </details>
            </li>
          </ul>
        </nav>
        <a
          href={`/api/admin/stats/export?${periodSearch(period)}`}
          download
          className={cn(chip, 'gap-2 self-start border border-night-200 bg-white text-night-900 hover:bg-night-50')}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter en CSV
        </a>
      </div>
      <p className="text-sm text-night-700">
        Période affichée : <strong className="text-night-900">{period.label}</strong>
        <span className="text-night-600"> · comparée {period.prevLabel}</span>
      </p>
      {error && (
        <p id="periode-erreur" role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-2 text-sm text-alert-700">
          {error}
        </p>
      )}
    </div>
  )
}
