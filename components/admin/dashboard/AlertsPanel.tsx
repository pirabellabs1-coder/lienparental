import Link from 'next/link'
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AlertLevel, DashboardAlert } from '@/lib/admin/stats/types'

const LEVEL: Record<AlertLevel, { label: string; icon: typeof Info; box: string; icon_: string }> = {
  critique: { label: 'Critique', icon: AlertOctagon, box: 'border-alert-200 bg-alert-50', icon_: 'text-alert-600' },
  attention: { label: 'À surveiller', icon: AlertTriangle, box: 'border-gold-200 bg-gold-50', icon_: 'text-gold-700' },
  info: { label: 'Information', icon: Info, box: 'border-night-100 bg-night-50', icon_: 'text-night-700' },
}

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section aria-labelledby="alertes-titre">
      <h2 id="alertes-titre" className="mb-3 text-xs font-bold uppercase tracking-wider text-night-600">
        Alertes {alerts.length > 0 && <span className="normal-case tracking-normal">({alerts.length})</span>}
      </h2>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl2 border border-leaf-200 bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          Aucune alerte : paiements, erreurs et quotas IA sont dans la normale.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {alerts.map((a) => {
            const l = LEVEL[a.level]
            const Icon = l.icon
            return (
              <li key={a.id} className={cn('flex gap-3 rounded-xl2 border px-4 py-3', l.box)}>
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', l.icon_)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-night-900">
                    <span className="sr-only">{l.label} : </span>
                    {a.title}
                    <span className={cn('ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold', a.level === 'critique' ? 'bg-alert-100 text-alert-700' : a.level === 'attention' ? 'bg-gold-100 text-gold-800' : 'bg-white text-night-700')} aria-hidden="true">
                      {l.label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-night-700">{a.detail}</p>
                  {a.href && (
                    <Link href={a.href} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                      {a.hrefLabel ?? 'Voir le détail'}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
