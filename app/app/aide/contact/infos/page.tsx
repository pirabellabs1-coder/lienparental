import { CalendarClock, Mail, Timer, UserRoundSearch } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { SUPPORT_EMAIL } from '@/components/profil/data'

export default async function ContactInfosPage() {
  const t = await getTranslations('public.help.contactInfo')
  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/aide/contact" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <h1 className="text-[16px] font-extrabold text-night-900">{t('title')}</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-night-800">
          {t('lead')}
        </p>

        <dl className="mt-6 space-y-6">
          <div className="flex items-start gap-4">
            <dt className="w-14 shrink-0 text-[12.5px] font-bold text-night-900">{t('byEmail')}</dt>
            <dd className="flex-1 text-[12.5px] text-night-800">
              {t('writeUs')}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 flex min-h-[44px] items-center justify-between gap-2 font-bold text-night-900 underline-offset-2 hover:underline">
                {SUPPORT_EMAIL}
                <Mail className="h-5 w-5 shrink-0" aria-hidden />
              </a>
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="flex w-14 shrink-0 justify-center pt-0.5 text-night-900">
              <Timer className="h-5 w-5" strokeWidth={1.8} aria-hidden /><span className="sr-only">{t('delaySr')}</span>
            </dt>
            <dd className="text-[12.5px] text-night-800">
              <span className="block font-bold text-night-900">{t('delayTitle')}</span>
              {t('delay')}
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="flex w-14 shrink-0 justify-center pt-0.5 text-night-900">
              <CalendarClock className="h-5 w-5" strokeWidth={1.8} aria-hidden /><span className="sr-only">{t('hoursSr')}</span>
            </dt>
            <dd className="text-[12.5px] text-night-800">
              <span className="block font-bold text-night-900">{t('hoursTitle')}</span>
              {t('hours')}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex items-start gap-3.5 rounded-xl2 bg-night-50/80 p-4">
          <UserRoundSearch className="mt-0.5 h-5 w-5 shrink-0 text-night-900" strokeWidth={1.8} aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-night-800">
            {t('faqTip')}
          </p>
        </div>
      </div>
    </>
  )
}
