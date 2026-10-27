import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CalendarDays, ClipboardCheck, Info, Star } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/coach/ui'
import { loadCoachUsage } from '@/lib/ai/quota'

// M09 — Coach IA · Informations sur le quota (maquette 12.12.09, page 5).
export const dynamic = 'force-dynamic'

export default async function CoachInformationsPage() {
  const t = await getTranslations('coach.usage.info')
  const tu = await getTranslations('coach.usage')
  const { total, resetDateLabel, live } = await loadCoachUsage()

  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/coach/utilisation" showBell={false} />

      <div className="w-full px-4 pb-8 pt-3">
        <section className="flex gap-3 rounded-xl2 border border-night-100 bg-night-50/80 p-4 shadow-soft">
          <Info className="h-6 w-6 shrink-0 text-night-700" aria-hidden="true" />
          <div>
            <h2 className="text-[13px] font-bold text-night-900">{t('aboutTitle')}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-700">
              {t('aboutText')}
            </p>
          </div>
        </section>

        <div className="mt-6 space-y-7">
          <InfoRow icon={ClipboardCheck} title={t('quotaTitle')}>
            {t('quotaText', { total })}
          </InfoRow>
          <InfoRow icon={CalendarDays} title={t('nextCycle')}>
            <span className="font-bold text-night-900">{resetDateLabel ? `${resetDateLabel}${live ? '' : tu('atMidnight')}` : t('noneYet')}</span>
          </InfoRow>
          <InfoRow icon={Star} title={t('moreTitle')}>
            {t('moreText')}
          </InfoRow>
        </div>

        <Link href="/app/aide/contact" className={`${btn.secondary} mt-6`}>
          {t('contact')}
        </Link>

      </div>
    </>
  )
}

function InfoRow({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-night-50" aria-hidden="true">
        <Icon className="h-5 w-5 text-night-800" />
      </span>
      <div>
        <h2 className="text-[13px] font-bold text-night-900">{title}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-700">{children}</p>
      </div>
    </section>
  )
}
