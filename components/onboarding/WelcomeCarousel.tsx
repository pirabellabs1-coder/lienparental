'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, HeartHandshake, Lock, MessagesSquare, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/brand/Logo'
import { ProgressDots } from './ProgressDots'
import { btn, linkLeaf } from './styles'

const TOTAL = 4
const backBtn = '-ml-2.5 grid h-11 w-11 place-items-center rounded-full text-night-900 transition-colors hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500'

/**
 * Onboarding steps 1-4 (Bienvenue, Pourquoi, Mission, Prêt(e) ?) as a swipeable carousel.
 * Keyboard: ←/→ when focus is not inside a form control. Respects reduced motion.
 */
export function WelcomeCarousel() {
  const router = useRouter()
  const t = useTranslations('public.onboarding.welcome')
  const [index, setIndex] = useState(0)
  const startX = useRef<number | null>(null)
  const deltaX = useRef(0)

  const goTo = useCallback((n: number) => setIndex(Math.min(Math.max(n, 0), TOTAL - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key === 'ArrowRight') goTo(index + 1)
      if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, goTo])

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    deltaX.current = 0
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current != null) deltaX.current = e.touches[0].clientX - startX.current
  }
  const onTouchEnd = () => {
    if (deltaX.current > 50) goTo(index - 1)
    else if (deltaX.current < -50) goTo(index + 1)
    startX.current = null
    deltaX.current = 0
  }

  const slides: ReactNode[] = [<SlideWelcome key="1" />, <SlideWhy key="2" />, <SlideMission key="3" />, <SlideReady key="4" />]

  return (
    <section className="flex flex-1 flex-col" aria-roledescription={t('carousel')} aria-label={t('carouselLabel')}>
      {/* Retour : page d'accueil du site au premier écran, écran précédent ensuite. */}
      <div className="px-6 pt-3">
        {index === 0 ? (
          <Link href="/" aria-label={t('backHome')} className={backBtn}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" onClick={() => goTo(index - 1)} aria-label={t('prevScreen')} className={backBtn}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live="polite"
        >
          {slides.map((s, i) => (
            <article
              key={i}
              aria-hidden={i !== index}
              inert={i !== index}
              aria-roledescription={t('slide')}
              aria-label={t('slideOf', { n: i + 1, total: TOTAL })}
              className="flex w-full shrink-0 flex-col overflow-y-auto px-6 pb-2 pt-1"
            >
              {s}
            </article>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-6 pb-5 pt-2">
        <ProgressDots current={index + 1} className="pb-3" />

        {index === 0 && (
          <>
            <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => goTo(1)}>
              {t('start')}
            </button>
            <p className="rounded-xl bg-leaf-50/70 px-4 py-3 text-center text-[13px] text-night-700">
              {t('haveAccount')}
              <br />
              <Link href="/onboarding/connexion" className={cn(linkLeaf, 'inline-flex min-h-[32px] items-center underline')}>
                {t('signIn')}
              </Link>
            </p>
          </>
        )}

        {(index === 1 || index === 2) && (
          <button type="button" className={cn(btn.primary, 'relative w-full')} onClick={() => goTo(index + 1)}>
            {t('next')}
            <ArrowRight className="absolute right-5 h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {index === 3 && (
          <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => router.push('/onboarding/inscription')}>
            {t('createAccount')}
          </button>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- slides -- */

function SlideWelcome() {
  const t = useTranslations('public.onboarding.welcome')
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <Logo size="lg" />
      <Image
        src="/images/onboarding/bienvenue.webp"
        alt={t('welcomeAlt')}
        width={720}
        height={376}
        priority
        className="mt-4 h-auto w-full max-w-[340px]"
      />
      <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.02em] text-night-900">{t('welcomeTitle')}</h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-night-600">
        {t.rich('welcomeText', { b: (c) => <strong className="font-bold text-night-900">{c}</strong> })}
      </p>
    </div>
  )
}

const FEATURES = [
  { key: 'communicate', icon: MessagesSquare, tone: 'bg-night-50 text-night-900' },
  { key: 'organize', icon: CalendarDays, tone: 'bg-leaf-50 text-leaf-600' },
  { key: 'secure', icon: Lock, tone: 'bg-night-50 text-night-900' },
] as const

function SlideWhy() {
  const t = useTranslations('public.onboarding.welcome')
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="text-center text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        {t.rich('whyTitle', { br: () => <br />, hl: (c) => <span className="text-leaf-500">{c}</span> })}
      </h1>
      <ul className="mt-9 space-y-7">
        {FEATURES.map(({ key, icon: Icon, tone }) => (
          <li key={key} className="flex items-start gap-4">
            <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', tone)} aria-hidden="true">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-night-900">{t(`features.${key}.title`)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-night-600">{t(`features.${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SlideMission() {
  const t = useTranslations('public.onboarding.welcome')
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        {t.rich('missionTitle', { br: () => <br />, hl: (c) => <span className="text-leaf-500">{c}</span> })}
      </h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-night-600">
        {t('missionLead')}
      </p>
      <Image
        src="/images/onboarding/mission.webp"
        alt={t('missionAlt')}
        width={720}
        height={421}
        className="mt-3 h-auto w-full max-w-[320px]"
      />
      <p className="mt-3 w-full rounded-2xl border border-night-100 bg-night-50/50 p-4 text-left text-sm leading-relaxed text-night-800">
        {t('missionText')}
      </p>
    </div>
  )
}

const VALUES = [
  { icon: CircleCheck, key: 'simple' },
  { icon: ShieldCheck, key: 'secure' },
  { icon: HeartHandshake, key: 'caring' },
] as const

function SlideReady() {
  const t = useTranslations('public.onboarding.welcome')
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <Image
        src="/images/onboarding/ensemble.webp"
        alt={t('readyAlt')}
        width={720}
        height={396}
        className="h-auto w-full max-w-[340px]"
      />
      <h1 className="mt-6 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        {t.rich('readyTitle', { hl: (c) => <span className="text-leaf-500">{c}</span> })}
      </h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-night-600">
        {t('readyText')}
      </p>
      <ul className="mt-8 grid w-full grid-cols-3 gap-2">
        {VALUES.map(({ icon: Icon, key }) => (
          <li key={key} className="flex flex-col items-center gap-2">
            <span className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-leaf-500 text-leaf-500" aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-bold text-night-900">{t(`values.${key}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
