import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Brain, CalendarCheck, Info, TrendingUp } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn, UsageBar } from '@/components/coach/ui'
import { loadCoachUsage } from '@/lib/ai/quota'

// M09 — Coach IA · Aperçu utilisation (maquette 12.12.09, page 1).
export const dynamic = 'force-dynamic'

export default async function CoachUtilisationPage() {
  const t = await getTranslations('coach.usage')
  const { used, total, resetInDays, resetDateLabel, live } = await loadCoachUsage()

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach" showBell={false} />

      <div className="w-full space-y-4 px-4 pb-8 pt-3">
        <section aria-labelledby="usage-title" className="rounded-xl2 border border-night-100 bg-white shadow-soft">
          <Link href="/app/coach/utilisation/detail" className="block rounded-t-xl2 px-4 pb-5 pt-4 hover:bg-night-50/40">
            <Brain className="h-9 w-9 text-night-900" strokeWidth={1.6} aria-hidden="true" />
            <h2 id="usage-title" className="mt-3 text-[15px] font-bold text-night-900">
              {t('current')}
              <span className="sr-only">{t('seeDetail')}</span>
            </h2>
            <p className="mt-2 text-[15px] text-night-900">
              <span className="text-[19px] font-extrabold">{used}</span>{t('ofAnalyses', { total })}
            </p>
            <div className="mt-3">
              <UsageBar used={used} total={total} label={t('usedThisCycle')} />
            </div>
          </Link>
          <div className="border-t border-night-100 px-4 py-4 text-center">
            <p className="text-[12.5px] text-night-700">{resetDateLabel ? (live ? t('releaseOn') : t('resetOn')) : t('noneCounted')}</p>
            {resetDateLabel && <p className="mt-1.5 text-[13px] font-bold text-leaf-600">{resetDateLabel}{live ? '' : t('atMidnight')}</p>}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/app/coach/utilisation/informations"
            className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft hover:border-night-200"
          >
            <TrendingUp className="h-6 w-6 text-night-900" aria-hidden="true" />
            <p className="mt-3 text-[12px] text-night-600">{t('plan')}</p>
            <p className="mt-1 text-[13px] font-bold text-night-900">{t('analysesCount', { count: total })}</p>
            <p className="text-[12px] text-night-700">{t('perCycle')}</p>
          </Link>
          <Link
            href="/app/coach/utilisation/tendances"
            className="rounded-xl2 border border-night-100 bg-white p-4 shadow-soft hover:border-night-200"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-night-50" aria-hidden="true">
              <CalendarCheck className="h-5 w-5 text-night-900" />
            </span>
            <p className="mt-2 text-[12px] text-night-600">{t('reset')}</p>
            <p className="mt-1 text-[13px] font-bold text-night-900">{resetInDays != null ? t('inDays', { count: resetInDays }) : t('cycle30')}</p>
            {resetDateLabel && <p className="text-[12px] text-night-700">({resetDateLabel})</p>}
          </Link>
        </div>

        <section className="flex gap-3 rounded-xl2 bg-night-50/80 p-4">
          <Info className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
          <div>
            <h2 className="text-[13px] font-bold text-night-900">{t('goodToKnow')}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-700">
              {t('goodToKnowText', { total })}
            </p>
          </div>
        </section>

        <div className="pt-4">
          <Link href="/app/coach/utilisation/historique" className={btn.primary}>
            {t('seeHistory')}
          </Link>
        </div>
      </div>
    </>
  )
}
