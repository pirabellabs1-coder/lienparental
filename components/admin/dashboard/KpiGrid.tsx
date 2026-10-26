// Indicateurs clés regroupés par thème, avec variation vs période précédente.
// La variation n'est jamais portée par la seule couleur : flèche + signe + phrase.
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Users,
  UserPlus,
  Activity,
  Crown,
  Percent,
  UserMinus,
  Euro,
  Wallet,
  PiggyBank,
  HeartHandshake,
  Sparkles,
  Receipt,
  HardDrive,
  FileText,
  MessageSquareHeart,
  LifeBuoy,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import { computeDelta, fmtValue } from '@/lib/admin/stats/format'
import type { Kpi, KpiGroup, KpiTone } from '@/lib/admin/stats/types'

const ICONS: Record<string, LucideIcon> = {
  inscrits: Users,
  nouveaux: UserPlus,
  actifs7: Activity,
  actifs30: CalendarClock,
  mrr: Wallet,
  'revenus-mois': Euro,
  'revenus-cumules': PiggyBank,
  dons: HeartHandshake,
  'premium-mensuel': Crown,
  'premium-annuel': Crown,
  conversion: Percent,
  desabonnements: UserMinus,
  coach: Sparkles,
  'coach-cout': Receipt,
  stockage: HardDrive,
  documents: FileText,
  temoignages: MessageSquareHeart,
  tickets: LifeBuoy,
}

const TONES: Record<KpiTone, string> = {
  leaf: 'bg-leaf-50 text-leaf-700',
  gold: 'bg-gold-50 text-gold-700',
  iris: 'bg-iris-50 text-iris-700',
  night: 'bg-night-50 text-night-700',
  alert: 'bg-alert-50 text-alert-600',
}

const GROUPS: { id: KpiGroup; title: string; cols: string }[] = [
  { id: 'audience', title: 'Audience', cols: 'xl:grid-cols-4' },
  { id: 'revenus', title: 'Revenus', cols: 'xl:grid-cols-4' },
  { id: 'premium', title: 'Abonnements payants', cols: 'xl:grid-cols-4' },
  { id: 'usage', title: 'Usage et support', cols: 'xl:grid-cols-3' },
]

function KpiCard({ k }: { k: Kpi }) {
  const Icon = ICONS[k.id] ?? Activity
  const d = computeDelta(k)
  const DeltaIcon = d.direction === 'up' ? ArrowUpRight : d.direction === 'down' ? ArrowDownRight : Minus
  const tone = d.sentiment === 'good' ? 'bg-leaf-50 text-leaf-800' : d.sentiment === 'bad' ? 'bg-alert-50 text-alert-700' : 'bg-night-50 text-night-700'
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <div className="flex h-full flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-snug text-night-700">{k.label}</p>
            <span className={cn('hidden h-9 w-9 shrink-0 min-[400px]:inline-flex items-center justify-center rounded-xl2', TONES[k.tone])} aria-hidden="true">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="font-display text-xl font-bold tabular-nums text-night-900 min-[400px]:text-2xl sm:text-[1.7rem]">{fmtValue(k.value, k.unit)}</p>
          <div className="mt-auto">
            {d.direction === 'none' ? (
              <p className="text-xs text-night-600">Pas de comparaison disponible</p>
            ) : (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-night-600">
                <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums', tone)}>
                  <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{d.direction === 'up' ? 'Hausse de' : d.direction === 'down' ? 'Baisse de' : ''}</span>
                  {d.text}
                </span>
                <span>{k.compareLabel ?? 'vs période précédente'}</span>
                <span className="sr-only">, valeur de comparaison : {fmtValue(k.previous, k.unit)}</span>
              </p>
            )}
            {k.hint && <p className="mt-1 text-[11px] leading-snug text-night-500">{k.hint}</p>}
          </div>
        </div>
      </Card>
    </li>
  )
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => {
        const items = kpis.filter((k) => k.group === g.id)
        if (!items.length) return null
        return (
          <section key={g.id} aria-labelledby={`kpi-${g.id}`}>
            <h2 id={`kpi-${g.id}`} className="mb-3 text-xs font-bold uppercase tracking-wider text-night-600">{g.title}</h2>
            <ul className={cn('grid grid-cols-2 gap-3', g.cols)}>
              {items.map((k) => <KpiCard key={k.id} k={k} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
