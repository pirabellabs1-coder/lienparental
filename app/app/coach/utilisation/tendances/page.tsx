import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { UsageBar } from '@/components/coach/ui'
import { cn } from '@/lib/cn'
import { loadCoachUsage } from '@/lib/ai/quota'
import { intlLocale } from '@/lib/i18n/config'

// M09 — Coach IA · Tendances d'utilisation (maquette 12.12.09, page 4).
export const dynamic = 'force-dynamic'

export default async function CoachTendancesPage() {
  const t = await getTranslations('coach.usage')
  const fmt = new Intl.NumberFormat(intlLocale(await getLocale()), { maximumFractionDigits: 1 })
  const { used, total, cycles } = await loadCoachUsage()
  // Libellés « Cycle actuel » / « Cycle -N » fournis en français par le serveur : traduits au rendu.
  const cycleLabel = (c: { label: string; current: boolean }) => {
    if (c.current) return t('trends.currentCycle')
    const m = /^Cycle -(\d+)$/.exec(c.label)
    return m ? t('trends.cycleN', { n: m[1]! }) : c.label
  }
  const last3 = cycles.slice(-3)
  const values = cycles.length ? cycles.map((c) => c.used) : [0]
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)

  return (
    <>
      <TopBar title={t('trends.topTitle')} showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="w-full px-4 pb-8 pt-3">
        <section aria-labelledby="this-cycle" className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
          <h2 id="this-cycle" className="text-[12.5px] font-bold text-night-900">
            {t('trends.thisCycle')}
          </h2>
          <p className="mt-2 text-[15px] text-night-900">
            <span className="text-[18px] font-extrabold">{used}</span>{t('ofAnalyses', { total })}
          </p>
          <div className="mt-3">
            <UsageBar used={used} total={total} label={t('usedThisCycle')} />
          </div>
          <p className="mt-3 text-[12px] text-night-700">{t('detail.pctUsed', { pct: Math.round((used / total) * 100) })}</p>
        </section>

        <figure className="mt-6">
          <figcaption className="text-[13px] font-bold text-night-900">{t('trends.last3')}</figcaption>

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
                    {cycleLabel(c)}
                    <br />({c.startLabel})
                  </span>
                ))}
              </div>
            </div>
          </div>

          <table className="sr-only">
            <caption>{t('trends.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('trends.colCycle')}</th>
                <th scope="col">{t('trends.colStart')}</th>
                <th scope="col">{t('trends.colAnalyses')}</th>
              </tr>
            </thead>
            <tbody>
              {last3.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{cycleLabel(c)}</th>
                  <td>{c.startLabel}</td>
                  <td>{c.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>

        <ul className="mt-6 divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
          <li className="flex min-h-[48px] items-center justify-between px-4">
            <span className="text-[13px] text-night-800">{t('trends.average')}</span>
            <span className="text-[13px] font-bold text-night-900">{t('trends.avgValue', { value: fmt.format(avg) })}</span>
          </li>
          <StatLink label={t('trends.max')} value={t('analysesCount', { count: max })} />
          <StatLink label={t('trends.min')} value={t('analysesCount', { count: min })} />
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
