// Dernières inscriptions et derniers paiements. Données minimisées :
// prénom + initiale du nom (calculés en base), jamais d'adresse e-mail.
import type { ReactNode } from 'react'
import { Baby, Crown } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import { fmtDateTime, fmtEurExact } from '@/lib/admin/stats/format'
import type { RecentPayment, RecentSignup } from '@/lib/admin/stats/types'

function Empty({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-night-200 px-4 py-6 text-center text-sm text-night-600">{children}</p>
}

function ListCard({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titre`} className="min-w-0">
      <Card className="h-full">
        <div className="px-5 pt-5">
          <h3 id={`${id}-titre`} className="font-display text-lg font-semibold text-night-900">{title}</h3>
          <p className="mt-1 text-sm text-night-600">{description}</p>
        </div>
        <div className="px-5 py-4">{children}</div>
      </Card>
    </section>
  )
}

export function RecentSignups({ rows }: { rows: RecentSignup[] }) {
  return (
    <ListCard id="dernieres-inscriptions" title="Dernières inscriptions" description="Prénom et initiale uniquement.">
      {rows.length === 0 ? (
        <Empty>Aucune inscription pour le moment.</Empty>
      ) : (
        <ul className="divide-y divide-night-100">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-night-900">{u.displayName}</p>
                <p className="text-xs text-night-600"><time dateTime={u.createdAt}>{fmtDateTime(u.createdAt)}</time></p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {u.hasChild && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2 py-0.5 text-[11px] font-semibold text-leaf-800">
                    <Baby className="h-3 w-3" aria-hidden="true" /> Enfant ajouté
                  </span>
                )}
                {u.plan === 'coparentalite' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-night-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Crown className="h-3 w-3" aria-hidden="true" /> Coparentalité+
                  </span>
                ) : u.plan === 'premium' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-800">
                    <Crown className="h-3 w-3" aria-hidden="true" /> Premium
                  </span>
                ) : (
                  <span className="rounded-full bg-night-50 px-2 py-0.5 text-[11px] font-semibold text-night-700">Gratuit</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  )
}

const STATUS: Record<RecentPayment['status'], { label: string; cls: string }> = {
  reussi: { label: 'Réussi', cls: 'bg-leaf-50 text-leaf-800' },
  echoue: { label: 'Échoué', cls: 'bg-alert-50 text-alert-700' },
  en_cours: { label: 'En cours', cls: 'bg-night-50 text-night-700' },
  rembourse: { label: 'Remboursé', cls: 'bg-night-50 text-night-700' },
}

export function RecentPayments({ rows }: { rows: RecentPayment[] }) {
  return (
    <ListCard id="derniers-paiements" title="Derniers paiements" description="Abonnements et dons, sans coordonnées bancaires.">
      {rows.length === 0 ? (
        <Empty>Aucun paiement enregistré.</Empty>
      ) : (
        <ul className="divide-y divide-night-100">
          {rows.map((p) => {
            const st = STATUS[p.status]
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-night-900">{p.displayName}</p>
                  <p className="text-xs text-night-600">
                    {p.label} · <time dateTime={p.createdAt}>{fmtDateTime(p.createdAt)}</time>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className={cn('text-sm font-semibold tabular-nums', p.status === 'echoue' ? 'text-night-500 line-through decoration-alert-500' : 'text-night-900')}>
                    {fmtEurExact(p.amountEur)}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', st.cls)}>{st.label}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ListCard>
  )
}
