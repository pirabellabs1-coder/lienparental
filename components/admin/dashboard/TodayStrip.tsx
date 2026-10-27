// Bandeau « Aujourd'hui » : quatre chiffres du jour, lisibles d'un coup d'œil,
// comparés à hier à la même heure. Indépendant de la période choisie.
import { LifeBuoy, MessageSquare, UserPlus, Activity, type LucideIcon } from 'lucide-react'
import { fmtDayKey } from '@/lib/tz'
import { fmtInt } from '@/lib/admin/stats/format'
import type { TodayStats } from '@/lib/admin/stats/types'

type Tile = { id: string; label: string; value: number; icon: LucideIcon; detail: string }

function vsYesterday(cur: number, prev: number): string {
  if (cur === prev) return `Comme hier à la même heure (${fmtInt(prev)})`
  const diff = cur - prev
  return `${diff > 0 ? '+' : '−'}${fmtInt(Math.abs(diff))} par rapport à hier à la même heure (${fmtInt(prev)})`
}

export function TodayStrip({ today }: { today: TodayStats | null }) {
  if (!today) return null
  const tiles: Tile[] = [
    { id: 'inscriptions', label: 'Inscriptions du jour', value: today.signups, icon: UserPlus, detail: vsYesterday(today.signups, today.signupsPrev) },
    { id: 'actifs', label: 'Actifs aujourd’hui', value: today.active, icon: Activity, detail: vsYesterday(today.active, today.activePrev) },
    { id: 'messages', label: 'Messages aujourd’hui', value: today.messages, icon: MessageSquare, detail: vsYesterday(today.messages, today.messagesPrev) },
    { id: 'tickets', label: 'Tickets ouverts', value: today.ticketsOpen, icon: LifeBuoy, detail: `${fmtInt(today.ticketsNew)} ${today.ticketsNew > 1 ? 'nouveaux' : 'nouveau'} aujourd’hui` },
  ]
  return (
    <section aria-labelledby="aujourdhui-titre" className="rounded-xl2 border border-night-100 bg-night-900 px-4 py-4 text-white shadow-soft sm:px-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="aujourdhui-titre" className="text-xs font-bold uppercase tracking-wider text-night-100">Aujourd’hui</h2>
        <p className="text-xs text-night-200">{fmtDayKey(today.day, { weekday: 'long', day: 'numeric', month: 'long' })}, depuis minuit (heure de Cayenne)</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.id} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-sm text-night-100">
              <t.icon className="h-4 w-4 shrink-0 text-leaf-300" aria-hidden="true" />
              {t.label}
            </dt>
            <dd className="mt-0.5 font-display text-3xl font-bold leading-tight">{fmtInt(t.value)}</dd>
            <dd className="text-xs leading-snug text-night-200">{t.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-night-200">Actifs : au moins une action dans la journée (journal, calendrier, coffre-fort, Coach IA, messages, Guide).</p>
    </section>
  )
}
