'use client'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { cn } from '@/lib/cn'

// Fenêtre « Découvrez Lien Parental en vidéo ».
// - Si public/video/presentation.mp4 existe (détecté côté serveur par app/page.tsx) : lecture avec sous-titres.
// - Sinon : diaporama des vraies captures de l'application, avec la mention « Vidéo bientôt disponible ».
// Ouverture : tout bouton <VideoTrigger> de la page (événement « home:video »). <dialog> natif : focus piégé, Échap, retour du focus.

const EVENT = 'home:video'

const SLIDES = [
  { src: '/images/app/mobile-accueil.png', title: 'Votre accueil', text: 'L’enfant suivi, le Guide parental, les dépenses, la santé et le Coach IA en un coup d’œil.' },
  { src: '/images/app/mobile-journal.png', title: 'Le Journal', text: 'Visites, appels, santé et dépenses, datés et classés, avec justificatifs.' },
  { src: '/images/app/mobile-calendrier.png', title: 'Le calendrier', text: 'Rendez-vous, rappels et événements de chaque enfant.' },
  { src: '/images/app/mobile-coffre.png', title: 'Le coffre-fort', text: 'Jugements, certificats, factures : rangés et protégés.' },
  { src: '/images/app/mobile-temoignages.png', title: 'Les témoignages', text: 'Demandez une attestation à un proche, suivie jusqu’à sa signature.' },
  { src: '/images/app/mobile-coach.png', title: 'Le Coach parental IA', text: 'Reformuler un message, préparer un échange, trouver le bon ton.' },
]

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

export function VideoDialog({ hasVideo, hasCaptions }: { hasVideo: boolean; hasCaptions: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

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

  return (
    <dialog
      ref={ref}
      aria-labelledby="video-title"
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) close() }}
      className="m-auto w-[min(920px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-3xl bg-white p-0 text-night-900 shadow-2xl backdrop:bg-night-950/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#E5E7EB] px-5 py-4 sm:px-7">
        <h2 id="video-title" className="text-[18px] font-bold sm:text-[20px]">Découvrez Lien Parental</h2>
        <button type="button" onClick={close} aria-label="Fermer" className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-[#E5E7EB] hover:bg-night-50">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {hasVideo ? (
        <div className="p-4 sm:p-6">
          {/* preload="none" : rien n'est téléchargé tant que la fenêtre n'est pas ouverte et la lecture lancée. */}
          {open && (
            <video ref={video} controls preload="metadata" playsInline poster="/video/presentation-poster.jpg" className="aspect-video w-full rounded-2xl bg-night-950">
              <source src="/video/presentation.mp4" type="video/mp4" />
              {hasCaptions && <track kind="captions" src="/video/presentation.fr.vtt" srcLang="fr" label="Français" />}
              Votre navigateur ne lit pas cette vidéo.{' '}
              <a href="/video/presentation.mp4">Télécharger la vidéo</a>.
            </video>
          )}
        </div>
      ) : (
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,260px)_1fr] md:items-center md:gap-10">
          <div className="mx-auto w-[150px] rounded-[2.2rem] bg-night-950 p-[6px] sm:w-[200px] shadow-[0_30px_60px_-30px_rgba(11,45,91,0.6)] md:w-full md:max-w-[260px]">
            <div className="relative aspect-[390/844] overflow-hidden rounded-[1.8rem] bg-white">
              {open && <Image key={slide.src} src={slide.src} alt={`Capture de l’application : ${slide.title}`} fill sizes="260px" className="home-rise object-cover object-top" />}
            </div>
          </div>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-3 py-1 text-[13px] font-semibold text-leaf-700">
              <Play className="h-3.5 w-3.5" aria-hidden />Vidéo bientôt disponible
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-night-700">En attendant, découvrez l’application en images : ce sont de vraies captures de Lien Parental.</p>
            <div aria-live="polite" className="mt-4 min-h-[96px] sm:mt-6">
              <p className="text-[13px] font-semibold text-night-600">{i + 1} sur {SLIDES.length}</p>
              <h3 className="mt-1 text-[20px] font-bold">{slide.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">{slide.text}</p>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={() => go(-1)} aria-label="Capture précédente" className="grid h-12 w-12 place-items-center rounded-full ring-1 ring-night-900/20 hover:bg-night-50">
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Capture suivante" className="grid h-12 w-12 place-items-center rounded-full bg-leaf-500 text-white hover:bg-leaf-600">
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
              <ol className="ml-2 flex gap-1.5" aria-label="Captures">
                {SLIDES.map((s, n) => (
                  <li key={s.src}>
                    <button
                      type="button"
                      onClick={() => setI(n)}
                      aria-label={`Afficher : ${s.title}`}
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
