import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { UsageBar } from '@/components/coach/ui'
import { cn } from '@/lib/cn'
import { loadCoachUsage } from '@/lib/ai/quota'

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

// M09 — Coach IA · Tendances d'utilisation (maquette 12.12.09, page 4).
export const dynamic = 'force-dynamic'

export default async function CoachTendancesPage() {
  const { used, total, cycles } = await loadCoachUsage()
  const last3 = cycles.slice(-3)
  const values = cycles.length ? cycles.map((c) => c.used) : [0]
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)

  return (
    <>
      <TopBar title="Tendances d’utilisation" showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="w-full px-4 pb-8 pt-3">
        <section aria-labelledby="this-cycle" className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
          <h2 id="this-cycle" className="text-[12.5px] font-bold text-night-900">
            Ce cycle
          </h2>
          <p className="mt-2 text-[15px] text-night-900">
            <span className="text-[18px] font-extrabold">{used}</span> / {total} analyses
          </p>
          <div className="mt-3">
            <UsageBar used={used} total={total} label="Analyses utilisées ce cycle" />
          </div>
          <p className="mt-3 text-[12px] text-night-700">{Math.round((used / total) * 100)}% utilisées</p>
        </section>

        <figure className="mt-6">
          <figcaption className="text-[13px] font-bold text-night-900">Utilisation des 3 derniers cycles</figcaption>

          {/* Graphique en barres — CSS pur, données exposées en tableau pour les lecteurs d'écran */}
          <div className="mt-4 flex gap-3" aria-hidden="true">
            <div className="flex h-[150px] flex-col justify-between pb-0 text-right text-[10px] leading-none text-night-500">
              <span>{total}</span>
              <span>{total / 2}</span>
              <span>0</span>
            </div>
            <div className="flex-1">
              <div className="relative flex h-[150px] items-end justify-around border-b border-night-100 px-2">
                <span className="absolute inset-x-0 top-0 border-t border-dashed border-night-100" />
                <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-night-100" />
                {last3.map((c) => (
                  <span
                    key={c.label}
                    className={cn('relative w-11 rounded-t-md', c.current ? 'bg-night-900' : 'bg-[#9297b8]')}
                    style={{ height: `${(Math.min(c.used, total) / total) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-around px-2">
                {last3.map((c) => (
                  <span key={c.label} className="w-[72px] text-center text-[10.5px] leading-tight text-night-700">
                    {c.label}
                    <br />({c.startLabel})
                  </span>
                ))}
              </div>
            </div>
          </div>

          <table className="sr-only">
            <caption>Analyses utilisées par cycle</caption>
            <thead>
              <tr>
                <th scope="col">Cycle</th>
                <th scope="col">Début</th>
                <th scope="col">Analyses</th>
              </tr>
            </thead>
            <tbody>
              {last3.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{c.label}</th>
                  <td>{c.startLabel}</td>
                  <td>{c.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>

        <ul className="mt-6 divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
          <li className="flex min-h-[48px] items-center justify-between px-4">
            <span className="text-[13px] text-night-800">Moyenne par cycle</span>
            <span className="text-[13px] font-bold text-night-900">{fmt.format(avg)} analyses</span>
          </li>
          <StatLink label="Utilisation maximale" value={`${max} analyses`} />
          <StatLink label="Utilisation minimale" value={`${min} analyses`} />
        </ul>
      </div>
    </>
  )
}

function StatLink({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <Link
          href="/app/coach/utilisation/historique"
          className="flex min-h-[48px] items-center justify-between px-4 hover:bg-night-50/50"
        >
          <span className="text-[13px] text-night-800">{label}</span>
          <span className="flex items-center gap-1 text-[13px] font-bold text-night-900">
            {value}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
    </li>
  )
}
