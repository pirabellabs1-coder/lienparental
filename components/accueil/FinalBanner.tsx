import Image from 'next/image'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { signupPath } from '@/lib/i18n/routing'
import { ArrowRight, BadgeCheck, MonitorSmartphone, Unlock } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'
import { BTN_PRIMARY, CONTAINER } from './ui'

const GUARANTEES = [
  { icon: BadgeCheck, key: 'guarantee1' },
  { icon: Unlock, key: 'guarantee2' },
  { icon: MonitorSmartphone, key: 'guarantee3' },
] as const

export async function FinalBanner() {
  const t = await getTranslations('finalBanner')
  const signup = signupPath(await getLocale())
  return (
    <section aria-labelledby="final-title" className="pb-20 pt-4 lg:pb-28">
      <div className={CONTAINER}>
        <div className="on-dark relative grid grid-cols-1 overflow-hidden rounded-[28px] bg-night-900 text-white lg:grid-cols-[0.85fr_1.2fr_auto] [&>*]:min-w-0">
          <div className="relative aspect-[16/9] lg:aspect-auto lg:min-h-[380px]">
            <Image src="/images/mere-fille-lecture.jpg" alt={t('photoAlt')} fill sizes="(min-width:1024px) 380px, 100vw" className="object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night-900/60 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-night-900" />
          </div>

          <div className="px-6 pt-10 sm:px-10 lg:py-14 lg:pl-6 lg:pr-4">
            <h2 id="final-title" className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] [text-wrap:balance] lg:text-[34px]">{t('title')}</h2>
            <p className="mt-3 max-w-[44ch] text-[15.5px] leading-relaxed text-night-100">{t('lead')}</p>
            <Link href={signup} className={cn(BTN_PRIMARY, 'mt-6 h-[52px] bg-leaf-500 px-7 text-[16px]')}>
              {t('cta')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <ul className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {GUARANTEES.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-center gap-2 text-[14px] font-semibold text-white">
                  <Icon className="h-[18px] w-[18px] text-leaf-300" strokeWidth={1.75} aria-hidden />{t(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* Carte logo avec baseline (maquette). */}
          <div className="flex items-center justify-center px-6 pb-10 pt-8 sm:px-10 lg:py-14 lg:pl-4 lg:pr-12">
            <div className="rounded-3xl bg-white px-8 py-7 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.6)]">
              <Logo size="md" tagline className="items-center text-center" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
