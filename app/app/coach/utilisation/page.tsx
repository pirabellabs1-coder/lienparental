import Link from 'next/link'
import { Brain, CalendarCheck, Info, TrendingUp } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn, UsageBar } from '@/components/coach/ui'
import { loadCoachUsage } from '@/lib/ai/quota'

// M09 — Coach IA · Aperçu utilisation (maquette 12.12.09, page 1).
export const dynamic = 'force-dynamic'

export default async function CoachUtilisationPage() {
  const { used, total, resetInDays, resetDateLabel, live } = await loadCoachUsage()

  return (
    <>
      <TopBar title="Coach IA" showBack backHref="/app/coach" showBell={false} />

      <div className="w-full space-y-4 px-4 pb-8 pt-3">
        <section aria-labelledby="usage-title" className="rounded-xl2 border border-night-100 bg-white shadow-soft">
          <Link href="/app/coach/utilisation/detail" className="block rounded-t-xl2 px-4 pb-5 pt-4 hover:bg-night-50/40">
            <Brain className="h-9 w-9 text-night-900" strokeWidth={1.6} aria-hidden="true" />
            <h2 id="usage-title" className="mt-3 text-[15px] font-bold text-night-900">
              Utilisation actuelle
              <span className="sr-only">, voir le détail</span>
            </h2>
            <p className="mt-2 text-[15px] text-night-900">
              <span className="text-[19px] font-extrabold">{used}</span> / {total} analyses
            </p>
            <div className="mt-3">
              <UsageBar used={used} total={total} label="Analyses utilisées ce cycle" />
            </div>
          </Link>
          <div className="border-t border-night-100 px-4 py-4 text-center">
            <p className="text-[12.5px] text-night-700">{resetDateLabel ? (live ? 'Une analyse se libère le' : 'Vos analyses se réinitialisent le') : 'Aucune analyse décomptée'}</p>
            {resetDateLabel && <p className="mt-1.5 text-[13px] font-bold text-leaf-600">{resetDateLabel}{live ? '' : ' à 00:00'}</p>}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/app/coach/utilisation/informations"
            className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft hover:border-night-200"
          >
            <TrendingUp className="h-6 w-6 text-night-900" aria-hidden="true" />
            <p className="mt-3 text-[12px] text-night-600">Forfait actuel</p>
            <p className="mt-1 text-[13px] font-bold text-night-900">{total} analyses</p>
            <p className="text-[12px] text-night-700">par cycle</p>
          </Link>
          <Link
            href="/app/coach/utilisation/tendances"
            className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft hover:border-night-200"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-night-50" aria-hidden="true">
              <CalendarCheck className="h-5 w-5 text-night-900" />
            </span>
            <p className="mt-2 text-[12px] text-night-600">Réinitialisation</p>
            <p className="mt-1 text-[13px] font-bold text-night-900">{resetInDays != null ? `Dans ${resetInDays} jours` : 'Cycle de 30 jours'}</p>
            {resetDateLabel && <p className="text-[12px] text-night-700">({resetDateLabel})</p>}
          </Link>
        </div>

        <section className="flex gap-3 rounded-xl2 bg-night-50/80 p-4">
          <Info className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
          <div>
            <h2 className="text-[13px] font-bold text-night-900">À savoir</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-700">
              Chaque cycle vous permet d’effectuer jusqu’à {total} analyses avec Coach IA. Votre compteur se réinitialise
              automatiquement tous les 30 jours.
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
