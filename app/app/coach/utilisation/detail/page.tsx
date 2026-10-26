import Link from 'next/link'
import { Brain, CalendarDays, CircleGauge, Lightbulb, RotateCw, TimerReset, UserRoundCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn, UsageBar } from '@/components/coach/ui'
import { cn } from '@/lib/cn'
import { loadCoachUsage } from '@/lib/ai/quota'

// M09 — Coach IA · Détail de l'utilisation (maquette 12.12.09, page 2).
export const dynamic = 'force-dynamic'

export default async function CoachUtilisationDetailPage() {
  const { used, total, resetInDays, resetDateLabel } = await loadCoachUsage()
  const pct = Math.round((used / total) * 100)

  const rows: { icon: typeof Brain; label: string; value: string; accent?: boolean; group: number }[] = [
    { icon: UserRoundCheck, label: 'Analyses utilisées', value: String(used), group: 0 },
    { icon: RotateCw, label: 'Analyses restantes', value: String(total - used), accent: true, group: 0 },
    { icon: CircleGauge, label: 'Total par cycle', value: String(total), group: 1 },
    { icon: TimerReset, label: 'Réinitialisation dans', value: resetInDays != null ? `${resetInDays} jours` : '—', group: 2 },
    { icon: CalendarDays, label: 'Date de réinitialisation', value: resetDateLabel ?? '—', group: 3 },
  ]
  const groups = [0, 1, 2, 3].map((g) => rows.filter((r) => r.group === g))

  return (
    <>
      <TopBar title="Détail utilisation" showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="w-full space-y-3 px-4 pb-8 pt-3">
        <section aria-labelledby="detail-title" className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <Brain className="h-9 w-9 shrink-0 text-night-900" strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h2 id="detail-title" className="text-[14px] font-bold text-night-900">
                Utilisation actuelle
              </h2>
              <p className="mt-2 text-[15px] text-night-900">
                <span className="text-[19px] font-extrabold">{used}</span> / {total} analyses
              </p>
            </div>
          </div>
          <div className="mt-3">
            <UsageBar used={used} total={total} label="Analyses utilisées ce cycle" />
          </div>
          <p className="mt-3 text-[12px] text-night-700">{pct}% utilisées</p>
        </section>

        {groups.map((g, gi) => (
          <dl key={gi} className="divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
            {g.map(({ icon: Icon, label, value, accent }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3.5">
                <Icon className="h-[18px] w-[18px] shrink-0 text-night-700" aria-hidden="true" />
                <dt className="flex-1 text-[13px] text-night-800">{label}</dt>
                <dd className={cn('text-[13px] font-bold', accent ? 'text-leaf-600' : 'text-night-900')}>{value}</dd>
              </div>
            ))}
          </dl>
        ))}

        <section className="flex gap-3 rounded-xl2 bg-leaf-50 p-4">
          <Lightbulb className="h-6 w-6 shrink-0 text-leaf-600" aria-hidden="true" />
          <div>
            <h2 className="text-[13px] font-bold text-leaf-700">Conseil</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-700">
              Planifiez vos analyses importantes pour optimiser votre cycle.
            </p>
          </div>
        </section>

        <div className="pt-4">
          <Link href="/app/coach/utilisation/historique" className={btn.primary}>
            Voir mon historique
          </Link>
        </div>
      </div>
    </>
  )
}
