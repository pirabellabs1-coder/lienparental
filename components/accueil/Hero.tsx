import Image from 'next/image'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { appShot } from '@/lib/i18n/shots'
import { ArrowRight, Download, HeartHandshake, MessagesSquare, Monitor, Play, Smartphone, Sun, Users } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { BTN_OUTLINE, BTN_PRIMARY, CONTAINER, IconBubble } from './ui'
import { VideoTrigger } from './VideoDialog'

const BENEFITS = [
  { icon: Sun, key: 'benefitCalm' },
  { icon: MessagesSquare, key: 'benefitComm' },
  { icon: HeartHandshake, key: 'benefitChild' },
] as const

const d = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties

export async function Hero() {
  const t = await getTranslations('home.hero')
  const locale = await getLocale()
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-[#F3F8F3] via-[#F8FBF8] to-white">
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 pb-12 pt-10 sm:pt-14 lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:pb-16 lg:pt-16 [&>*]:min-w-0')}>
        <div>
          <p className="home-rise inline-flex items-center rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-leaf-700 ring-1 ring-inset ring-leaf-200">
            {t('badge')}
          </p>
          <h1 id="hero-title" className="home-rise mt-5 max-w-[15ch] text-[35px] font-extrabold leading-[1.1] tracking-[-0.03em] text-night-900 [text-wrap:balance] sm:text-[42px] xl:text-[48px]" style={d(60)}>
            {t('titleStart')}<span className="text-leaf-500">{t('titleHighlight')}</span>
          </h1>
          <p className="home-rise mt-5 max-w-[50ch] text-[17px] leading-relaxed text-night-700" style={d(120)}>
            {t('subtitle')}
          </p>

          <ul className="home-rise mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" style={d(180)}>
            {BENEFITS.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-[15px] font-semibold leading-snug text-night-900 sm:flex-col sm:items-start sm:gap-2.5">
                <IconBubble size="sm" className="bg-white ring-1 ring-leaf-200"><Icon strokeWidth={1.75} /></IconBubble>
                {t(key)}
              </li>
            ))}
          </ul>

          <div className="home-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={d(240)}>
            <Link href="/onboarding" className={cn(BTN_PRIMARY, 'h-14 px-7 text-[16px] shadow-[0_14px_30px_-14px_rgba(46,125,50,0.8)]')}>
              {t('ctaCreate')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <VideoTrigger className={cn(BTN_OUTLINE, 'h-14 px-6 text-[16px]')}>
              <Play className="h-4 w-4 text-leaf-600" fill="currentColor" aria-hidden />
              {t('watchVideo')}
            </VideoTrigger>
          </div>

          {/* Encart d'installation façon « télécharger l'application » (PWA : pas de store, pas de badge de store). */}
          <div className="home-rise mt-8" style={d(300)}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-night-600">{t('downloadTitle')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href="/installer"
                className="group inline-flex min-h-[60px] items-center gap-3 rounded-2xl bg-night-900 py-2.5 pl-3 pr-5 text-white shadow-[0_14px_30px_-16px_rgba(11,45,91,0.9)] transition-[transform,background-color] duration-200 hover:bg-night-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Download className="h-5 w-5 transition-transform duration-200 group-hover:translate-y-0.5" strokeWidth={2} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[11.5px] font-medium text-night-100">{t('installMobilePre')}</span>
                  <span className="text-[17px] font-bold">{t('installMobile')}</span>
                </span>
              </Link>
              <Link
                href="/installer"
                className="inline-flex min-h-[60px] items-center gap-3 rounded-2xl bg-white py-2.5 pl-3 pr-5 text-night-900 ring-1 ring-[#E5E7EB] transition-colors duration-200 hover:ring-leaf-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
                  <Monitor className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[11.5px] font-medium text-night-600">{t('installAlsoPre')}</span>
                  <span className="text-[17px] font-bold">{t('installDesktop')}</span>
                </span>
              </Link>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[13.5px] text-night-600">
              <Smartphone className="h-4 w-4 shrink-0 text-leaf-600" strokeWidth={1.75} aria-hidden />
              {t('noStore')}
            </p>
          </div>
        </div>

        {/* Visuel : la photo porte l'émotion, le téléphone (vraie capture) la preuve, la signature et la carte la promesse. */}
        <div className="home-rise relative mx-auto w-full max-w-[520px]" style={d(150)}>
          <div className="relative">
            <div className="relative ml-auto aspect-[4/5] w-[86%] overflow-hidden rounded-[32px] bg-night-100 shadow-[0_40px_80px_-40px_rgba(11,45,91,0.5)]">
              <Image
                src="/images/hero-pere-fille.jpg"
                alt={t('photoAlt')}
                fill
                priority
                sizes="(min-width:1024px) 450px, 86vw"
                className="object-cover object-[50%_30%]"
              />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-night-950/85 via-night-950/35 to-transparent" />
              <p className="absolute bottom-14 right-5 max-w-[66%] text-right font-script text-[24px] leading-[1.05] text-white sm:bottom-16 sm:right-6 sm:text-[32px]">
                {t('signatureLine')}<span className="block whitespace-nowrap text-leaf-200">{t('signatureHighlight')}</span>
              </p>
            </div>
            <PhoneFrame
              src={appShot('mobile-accueil', locale)}
              alt={t('phoneAlt')}
              sizes="(min-width:1024px) 200px, 38vw"
              priority
              className="absolute bottom-[14%] left-0 w-[38%] max-w-[200px]"
            />
          </div>
          <div className="relative -mt-8 ml-auto flex w-[78%] max-w-[340px] items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_20px_44px_-24px_rgba(11,45,91,0.45)] ring-1 ring-[#E5E7EB] sm:w-[70%]">
            <IconBubble size="sm"><Users strokeWidth={1.75} /></IconBubble>
            <p className="text-[14px] font-semibold leading-snug text-night-900">{t('promiseCard')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
