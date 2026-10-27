'use client'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { cn } from '@/lib/cn'

// Fenêtre « Découvrez Lien Parental en vidéo ».
// - Si la vidéo de la langue courante existe (détectée côté serveur par app/page.tsx) : lecture, voix off seule (pas de sous-titres).
// - Sinon : diaporama des vraies captures de l'application (localisées), avec la mention « Vidéo bientôt disponible ».
// Ouverture : tout bouton <VideoTrigger> de la page (événement « home:video »). <dialog> natif : focus piégé, Échap, retour du focus.

const EVENT = 'home:video'

/** Vidéo de présentation de la langue courante (chemins publics). */
export type PresentationVideo = { src: string; poster: string }

const SLIDES = [
  { name: 'mobile-accueil', key: 'accueil' },
  { name: 'mobile-journal', key: 'journal' },
  { name: 'mobile-calendrier', key: 'calendrier' },
  { name: 'mobile-coffre', key: 'coffre' },
  { name: 'mobile-temoignages', key: 'temoignages' },
  { name: 'mobile-coach', key: 'coach' },
] as const

/** Capture de l'app dans la langue : /images/app/<nom>.png en français, /images/app/<locale>/<nom>.png sinon. */
const slideSrc = (name: string, locale: string) =>
  locale === 'en' || locale === 'pt' ? `/images/app/${locale}/${name}.png` : `/images/app/${name}.png`

export function VideoTrigger({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      className={className}
      onClick={e => window.dispatchEvent(new CustomEvent(EVENT, { detail: e.currentTarget }))}
    >
      {children}
    </button>
  )
}

export function VideoDialog({ video: media }: { video: PresentationVideo | null }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const t = useTranslations('video.dialog')
  const ts = useTranslations('video.slides')
  const locale = useLocale()

  useEffect(() => {
    const onOpen = (e: Event) => {
      opener.current = (e as CustomEvent<HTMLElement>).detail ?? null
      setI(0)
      ref.current?.showModal()
      setOpen(true)
    }
    window.addEventListener(EVENT, onOpen)
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  const close = useCallback(() => ref.current?.close(), [])

  const onClose = () => {
    video.current?.pause()
    setOpen(false)
    opener.current?.focus()
  }

  const go = (d: number) => setI(n => (n + d + SLIDES.length) % SLIDES.length)
  const slide = SLIDES[i]
  const slideTitle = (k: string) => ts(`${k}.title`)

  return (
    <dialog
      ref={ref}
      aria-labelledby="video-title"
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) close() }}
      className="m-auto w-[min(920px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-3xl bg-white p-0 text-night-900 shadow-2xl backdrop:bg-night-950/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] px-5 py-4 sm:px-7">
        <h2 id="video-title" className="text-[18px] font-bold sm:text-[20px]">{t('title')}</h2>
        <button type="button" onClick={close} aria-label={t('close')} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-[#E5E7EB] hover:bg-night-50">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {media ? (
        <div className="p-4 sm:p-6">
          {/* Rendu seulement à l'ouverture : rien n'est téléchargé avant (preload="metadata" ensuite). */}
          {open && (
            <video key={media.src} ref={video} controls preload="metadata" playsInline poster={media.poster} className="aspect-video w-full rounded-2xl bg-night-950">
              <source src={media.src} type="video/mp4" />
              {t('unsupported')}{' '}
              <a href={media.src}>{t('download')}</a>.
            </video>
          )}
        </div>
      ) : (
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,260px)_1fr] md:items-center md:gap-10">
          <div className="mx-auto w-[150px] rounded-[2.2rem] bg-night-950 p-[6px] sm:w-[200px] shadow-[0_30px_60px_-30px_rgba(11,45,91,0.6)] md:w-full md:max-w-[260px]">
            <div className="relative aspect-[390/844] overflow-hidden rounded-[1.8rem] bg-white">
              {open && <Image key={slide.name} src={slideSrc(slide.name, locale)} alt={t('alt', { title: slideTitle(slide.key) })} fill sizes="260px" className="home-rise object-cover object-top" />}
            </div>
          </div>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-3 py-1 text-[13px] font-semibold text-leaf-700">
              <Play className="h-3.5 w-3.5" aria-hidden />{t('soon')}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-night-700">{t('meanwhile')}</p>
            <div aria-live="polite" className="mt-4 min-h-[96px] sm:mt-6">
              <p className="text-[13px] font-semibold text-night-600">{t('counter', { n: i + 1, total: SLIDES.length })}</p>
              <h3 className="mt-1 text-[20px] font-bold">{slideTitle(slide.key)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">{ts(`${slide.key}.text`)}</p>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={() => go(-1)} aria-label={t('prev')} className="grid h-12 w-12 place-items-center rounded-full ring-1 ring-night-900/20 hover:bg-night-50">
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t('next')} className="grid h-12 w-12 place-items-center rounded-full bg-leaf-500 text-white hover:bg-leaf-600">
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
              <ol className="ml-2 flex gap-1.5" aria-label={t('list')}>
                {SLIDES.map((s, n) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => setI(n)}
                      aria-label={t('show', { title: slideTitle(s.key) })}
                      aria-current={n === i ? 'true' : undefined}
                      className="grid h-6 w-6 place-items-center rounded-full"
                    >
                      <span aria-hidden className={cn('block h-2 rounded-full transition-colors duration-200', n === i ? 'w-5 bg-leaf-500' : 'w-2 bg-night-200')} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
