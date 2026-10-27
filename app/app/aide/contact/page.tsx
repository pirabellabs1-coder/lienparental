import Link from 'next/link'
import { Clock, Mail, MailCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { cn } from '@/lib/cn'

export default async function ContactPage() {
  const t = await getTranslations('public.help.contact')
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-iris-50 text-night-900">
            <MailCheck className="h-10 w-10" strokeWidth={1.5} />
          </span>
          <h1 className="mt-5 text-[16px] font-extrabold leading-snug text-night-900">
            {t('headline1')}
            <br />
            {t('headline2')}
          </h1>
          <p className="mt-3 max-w-[270px] text-[12.5px] leading-relaxed text-night-800">
            {t('lead')}
          </p>
        </div>

        <Link href="/app/aide/contact/message" className={cn(btn.primary, 'mt-6 text-[13.5px]')}>{t('send')}</Link>
        <Link href="/app/aide/faq" className={cn(btn.secondary, 'mt-3 text-[13.5px]')}>{t('faq')}</Link>

        <h2 className="mt-7 text-[13px] font-bold text-night-900">{t('other')}</h2>
        <ul className="mt-2">
          <li>
            <Link href="/app/aide/contact/infos" className="flex min-h-[60px] items-center gap-4 rounded-lg py-2 hover:bg-night-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
              <Mail className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
              <span>
                <span className="block text-[13px] font-bold text-night-900">{t('email')}</span>
                <span className="block text-[12.5px] text-night-800">{SUPPORT_EMAIL}</span>
              </span>
            </Link>
          </li>
          <li className="flex min-h-[60px] items-center gap-4 py-2">
            <Clock className="h-6 w-6 shrink-0 text-night-900" strokeWidth={1.7} aria-hidden />
            <span>
              <span className="block text-[13px] font-bold text-night-900">{t('hoursTitle')}</span>
              <span className="block text-[12.5px] text-night-800">{t('hours')}</span>
            </span>
          </li>
        </ul>
      </div>
    </>
  )
}
