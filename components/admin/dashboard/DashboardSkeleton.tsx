// État de chargement (Suspense) : structure identique au tableau de bord
// pour éviter les sauts de mise en page.
export function DashboardSkeleton() {
  const block = 'rounded-xl2 border border-night-100 bg-white shadow-soft'
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Chargement des statistiques…</span>
      <div className={`${block} h-14 animate-pulse motion-reduce:animate-none`} aria-hidden="true" />
      {[4, 4, 4, 6].map((n, g) => (
        <div key={g} aria-hidden="true">
          <div className="mb-3 h-3 w-24 rounded bg-night-100" />
          <div className={`grid grid-cols-2 gap-3 ${n === 6 ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className={`${block} h-[132px] animate-pulse motion-reduce:animate-none`} />
            ))}
          </div>
        </div>
      ))}
      <div className="grid gap-4 xl:grid-cols-3" aria-hidden="true">
        <div className={`${block} h-[380px] animate-pulse motion-reduce:animate-none xl:col-span-2`} />
        <div className={`${block} h-[380px] animate-pulse motion-reduce:animate-none`} />
      </div>
    </div>
  )
}

export function DashboardError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl2 border border-alert-200 bg-alert-50 px-5 py-6">
      <h2 className="font-display text-lg font-semibold text-alert-700">Statistiques indisponibles</h2>
      <p className="mt-1 text-sm text-night-800">{message}</p>
      <a href="/admin" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-leaf-500 px-4 text-sm font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2">
        Réessayer
      </a>
    </div>
  )
}
