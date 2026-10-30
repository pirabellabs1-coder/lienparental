import { getTranslations } from 'next-intl/server'

/**
 * Silhouette d'écran des loading.tsx de l'espace connecté : affichée dès le clic, pendant que le
 * serveur répond. Composant serveur, sans JavaScript ; la barre d'onglets et le menu latéral
 * (layout /app) restent en place.
 *
 * Les loading.tsx rendent aussi les routes dynamiques préchargeables : sans eux, Next ne précharge
 * rien d'une route dynamique et chaque clic attend un aller-retour complet avec le serveur.
 */
export default async function PageSkeleton() {
  const t = await getTranslations('shared.states.loading')
  return (
    <div role="status" className="w-full px-5 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
      <span className="sr-only">{t('title')}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-9 w-28 rounded-lg bg-night-100" />
          <div className="flex gap-2">
            <div className="h-10 w-10 rounded-full bg-night-100" />
            <div className="h-10 w-10 rounded-full bg-night-100" />
          </div>
        </div>
        <div className="mt-6 h-7 w-2/3 max-w-[360px] rounded-lg bg-night-100" />
        <div className="mt-2 h-4 w-1/2 max-w-[280px] rounded bg-night-50" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-night-50 ring-1 ring-night-100" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Variante des parcours publics (onboarding) : pas de barre d'en-tête, écran centré. */
export async function FlowSkeleton() {
  const t = await getTranslations('shared.states.loading')
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <span className="sr-only">{t('title')}</span>
      <div aria-hidden="true" className="flex w-full max-w-[320px] flex-col items-center motion-safe:animate-pulse">
        <div className="h-16 w-16 rounded-full bg-night-100" />
        <div className="mt-6 h-6 w-3/4 rounded-lg bg-night-100" />
        <div className="mt-3 h-4 w-full rounded bg-night-50" />
        <div className="mt-2 h-4 w-5/6 rounded bg-night-50" />
        <div className="mt-8 h-12 w-full rounded-xl bg-night-100" />
      </div>
    </div>
  )
}
