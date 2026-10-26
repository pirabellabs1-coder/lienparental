'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const [index, setIndex] = useState(0)
  const startX = useRef<number | null>(null)
  const deltaX = useRef(0)

  const goTo = useCallback((n: number) => setIndex(Math.min(Math.max(n, 0), TOTAL - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
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
    <section className="flex flex-1 flex-col" aria-roledescription="carrousel" aria-label="Découvrir Lien Parental">
      {/* Retour : page d'accueil du site au premier écran, écran précédent ensuite. */}
      <div className="px-6 pt-3">
        {index === 0 ? (
          <Link href="/" aria-label="Retour à la page d’accueil" className={backBtn}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Écran précédent" className={backBtn}>
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
              aria-roledescription="diapositive"
              aria-label={`${i + 1} sur ${TOTAL}`}
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
              Commencer
            </button>
            <p className="rounded-xl bg-leaf-50/70 px-4 py-3 text-center text-[13px] text-night-700">
              Vous avez déjà un compte ?
              <br />
              <Link href="/onboarding/connexion" className={cn(linkLeaf, 'inline-flex min-h-[32px] items-center underline')}>
                Se connecter
              </Link>
            </p>
          </>
        )}

        {(index === 1 || index === 2) && (
          <button type="button" className={cn(btn.primary, 'relative w-full')} onClick={() => goTo(index + 1)}>
            Suivant
            <ArrowRight className="absolute right-5 h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {index === 3 && (
          <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => router.push('/onboarding/inscription')}>
            Créer mon compte
          </button>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- slides -- */

function SlideWelcome() {
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <Logo size="lg" />
      <Image
        src="/images/onboarding/bienvenue.webp"
        alt="Un père et une mère, assis face à face, accueillent leur fille qui court vers eux en souriant"
        width={720}
        height={376}
        priority
        className="mt-4 h-auto w-full max-w-[340px]"
      />
      <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.02em] text-night-900">Bienvenue&nbsp;!</h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-night-600">
        Un espace pensé pour les parents, centré sur l’essentiel&nbsp;: <strong className="font-bold text-night-900">le bien-être de votre enfant.</strong>
      </p>
    </div>
  )
}

const FEATURES = [
  {
    icon: MessagesSquare,
    tone: 'bg-night-50 text-night-900',
    title: 'Communiquez sereinement',
    text: 'Des outils et des modèles pour échanger clairement et sans conflit.',
  },
  {
    icon: CalendarDays,
    tone: 'bg-leaf-50 text-leaf-600',
    title: 'Organisez facilement',
    text: 'Calendrier partagé, événements, rendez-vous et rappels importants.',
  },
  {
    icon: Lock,
    tone: 'bg-night-50 text-night-900',
    title: 'Sécurisez vos documents',
    text: 'Conservez tous vos documents importants dans un coffre-fort sécurisé.',
  },
]

function SlideWhy() {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="text-center text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        Tout ce dont vous avez
        <br />
        besoin, <span className="text-leaf-500">au même endroit.</span>
      </h1>
      <ul className="mt-9 space-y-7">
        {FEATURES.map(({ icon: Icon, tone, title, text }) => (
          <li key={title} className="flex items-start gap-4">
            <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', tone)} aria-hidden="true">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-night-900">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-night-600">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SlideMission() {
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        Pensé pour l’intérêt
        <br />
        supérieur <span className="text-leaf-500">de l’enfant.</span>
      </h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-night-600">
        Des fonctionnalités conçues pour préserver le lien parent-enfant dans le respect et la bienveillance.
      </p>
      <Image
        src="/images/onboarding/mission.webp"
        alt="Une mère serre tendrement sa fille dans ses bras, toutes deux les yeux fermés et souriantes"
        width={720}
        height={421}
        className="mt-3 h-auto w-full max-w-[320px]"
      />
      <p className="mt-3 w-full rounded-2xl border border-night-100 bg-night-50/50 p-4 text-left text-sm leading-relaxed text-night-800">
        Chaque outil aide à garder des échanges clairs et apaisés entre parents, pour que l’enfant garde sa place auprès de chacun.
      </p>
    </div>
  )
}

const VALUES = [
  { icon: CircleCheck, label: 'Simple' },
  { icon: ShieldCheck, label: 'Sécurisé' },
  { icon: HeartHandshake, label: 'Bienveillant' },
]

function SlideReady() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <Image
        src="/images/onboarding/ensemble.webp"
        alt="Un père et une mère se tapent dans la main au-dessus de leur fille, qui lève les bras de joie"
        width={720}
        height={396}
        className="h-auto w-full max-w-[340px]"
      />
      <h1 className="mt-6 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-night-900">
        Ensemble pour le bien-être <span className="text-leaf-500">de votre enfant.</span>
      </h1>
      <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-night-600">
        Une meilleure communication entre parents, pour un quotidien plus serein.
      </p>
      <ul className="mt-8 grid w-full grid-cols-3 gap-2">
        {VALUES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex flex-col items-center gap-2">
            <span className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-leaf-500 text-leaf-500" aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-bold text-night-900">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
