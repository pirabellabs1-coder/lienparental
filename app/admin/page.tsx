import { Suspense } from 'react'
import { FlaskConical } from 'lucide-react'
import { DEMO_MODE } from '@/lib/demo-auth'
import { todayKey } from '@/lib/tz'
import { getDashboard, parsePeriod, periodSearch, type Period } from '@/lib/admin/stats'
import { PeriodPicker } from '@/components/admin/dashboard/PeriodPicker'
import { Dashboard } from '@/components/admin/dashboard/Dashboard'
import { DashboardError, DashboardSkeleton } from '@/components/admin/dashboard/DashboardSkeleton'

export const metadata = { title: 'Tableau de bord · Admin' }
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function DashboardContent({ period }: { period: Period }) {
  const result = await getDashboard(period)
  if (!result.ok) return <DashboardError message={result.error} />
  return <Dashboard data={result.data} />
}

export default async function AdminDashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const { period, error } = parsePeriod(sp)
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const typed = { du: /^\d{4}-\d{2}-\d{2}$/.test(first(sp.du) ?? '') ? first(sp.du) : undefined, au: /^\d{4}-\d{2}-\d{2}$/.test(first(sp.au) ?? '') ? first(sp.au) : undefined }
  const customRequested = (Array.isArray(sp.periode) ? sp.periode[0] : sp.periode) === 'perso'

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-night-900">Tableau de bord</h1>
          <p className="mt-1 text-sm text-night-600">Inscriptions, revenus, usage des modules et alertes du produit.</p>
        </div>
        {DEMO_MODE && (
          <p className="inline-flex items-center gap-2 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-sm font-semibold text-gold-800">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Données de démonstration
          </p>
        )}
      </header>

      {DEMO_MODE && (
        <p role="note" className="rounded-xl2 border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-night-800">
          <strong className="text-night-900">Données de démonstration.</strong> Chiffres fictifs mais cohérents entre eux, générés pour la recette.
          Les vrais chiffres s’affichent dès que Supabase est configuré (et Stripe pour les revenus).
        </p>
      )}

      <PeriodPicker period={period} error={error} today={todayKey()} customRequested={customRequested} typed={typed} />

      <Suspense key={periodSearch(period)} fallback={<DashboardSkeleton />}>
        <DashboardContent period={period} />
      </Suspense>
    </div>
  )
}
