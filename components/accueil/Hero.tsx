import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, HeartHandshake, MessagesSquare, Play, Smartphone, Sun, Users } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { BTN_OUTLINE, BTN_PRIMARY, CONTAINER, IconBubble } from './ui'
import { VideoTrigger } from './VideoDialog'

const BENEFITS = [
  { icon: Sun, label: 'Plus de sérénité au quotidien' },
  { icon: MessagesSquare, label: 'Une meilleure communication' },
  { icon: HeartHandshake, label: 'Toujours dans l’intérêt de votre enfant' },
]

const d = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-[#F3F8F3] via-[#F8FBF8] to-white">
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 pb-12 pt-10 sm:pt-14 lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:pb-16 lg:pt-16 [&>*]:min-w-0')}>
        <div>
          <p className="home-rise inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-leaf-700 ring-1 ring-inset ring-leaf-200">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-leaf-400" />
            L’application des parents séparés
          </p>
          <h1 id="hero-title" className="home-rise mt-5 max-w-[15ch] text-[35px] font-extrabold leading-[1.1] tracking-[-0.03em] text-night-900 [text-wrap:balance] sm:text-[42px] xl:text-[48px]" style={d(60)}>
            Tout pour votre enfant, <span className="text-leaf-500">enfin au même endroit.</span>
          </h1>
          <p className="home-rise mt-5 max-w-[50ch] text-[17px] leading-relaxed text-night-700" style={d(120)}>
            Organisez, communiquez, conservez et avancez sereinement dans votre vie de parent séparé, avec des outils simples, pratiques et fiables, adaptés à votre situation.
          </p>

          <ul className="home-rise mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" style={d(180)}>
            {BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-[15px] font-semibold leading-snug text-night-900 sm:flex-col sm:items-start sm:gap-2.5">
                <IconBubble size="sm" className="bg-white ring-1 ring-leaf-200"><Icon strokeWidth={1.75} /></IconBubble>
                {label}
              </li>
            ))}
          </ul>

          <div className="home-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={d(240)}>
            <Link href="/onboarding" className={cn(BTN_PRIMARY, 'h-14 px-7 text-[16px] shadow-[0_14px_30px_-14px_rgba(46,125,50,0.8)]')}>
              Créer un compte gratuitement<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <VideoTrigger className={cn(BTN_OUTLINE, 'h-14 px-6 text-[16px]')}>
              <Play className="h-4 w-4 text-leaf-600" fill="currentColor" aria-hidden />
              Voir la vidéo (1 min)
            </VideoTrigger>
          </div>

          {/* Encart PWA de la maquette. */}
          <div className="home-rise mt-7 flex max-w-[520px] items-start gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-[#E5E7EB]" style={d(300)}>
            <IconBubble size="sm"><Smartphone strokeWidth={1.75} /></IconBubble>
            <div className="text-[14px] leading-snug text-night-700">
              <p className="font-bold text-night-900">Disponible en version web (PWA)</p>
              <p className="mt-0.5">Ni sur le Play Store, ni sur l’App Store.</p>
              <Link href="/installer" className="mt-1 inline-flex min-h-[32px] items-center font-semibold text-leaf-600 underline decoration-leaf-600/40 underline-offset-2 hover:decoration-leaf-600">
                Installez Lien Parental sur votre téléphone en quelques secondes
              </Link>
            </div>
          </div>
        </div>

        {/* Visuel : la photo porte l'émotion, le téléphone (vraie capture) la preuve, la signature et la carte la promesse. */}
        <div className="home-rise relative mx-auto w-full max-w-[520px]" style={d(150)}>
          <div className="relative">
            <div className="relative ml-auto aspect-[4/5] w-[86%] overflow-hidden rounded-[32px] bg-night-100 shadow-[0_40px_80px_-40px_rgba(11,45,91,0.5)]">
              <Image
                src="/images/hero-pere-fille.jpg"
                alt="Un père serre tendrement sa fille dans ses bras, tous deux souriants"
                fill
                priority
                sizes="(min-width:1024px) 450px, 86vw"
                className="object-cover object-[50%_30%]"
              />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-night-950/85 via-night-950/35 to-transparent" />
              <p className="absolute bottom-14 right-5 max-w-[66%] text-right font-script text-[24px] leading-[1.05] text-white sm:bottom-16 sm:right-6 sm:text-[32px]">
                Informer, Accompagner, Préserver,<span className="block whitespace-nowrap text-leaf-200">le lien parent-enfant</span>
              </p>
            </div>
            <PhoneFrame
              src="/images/app/mobile-accueil.png"
              alt="L’accueil de l’application Lien Parental : l’enfant suivi, le Guide parental, les dépenses, la santé, les témoignages et la messagerie"
              sizes="(min-width:1024px) 200px, 38vw"
              priority
              className="absolute bottom-[14%] left-0 w-[38%] max-w-[200px]"
            />
          </div>
          <div className="relative -mt-8 ml-auto flex w-[78%] max-w-[340px] items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_20px_44px_-24px_rgba(11,45,91,0.45)] ring-1 ring-[#E5E7EB] sm:w-[70%]">
            <IconBubble size="sm"><Users strokeWidth={1.75} /></IconBubble>
            <p className="text-[14px] font-semibold leading-snug text-night-900">Un outil pensé pour tous les parents, au service des enfants</p>
          </div>
        </div>
      </div>
    </section>
  )
}
