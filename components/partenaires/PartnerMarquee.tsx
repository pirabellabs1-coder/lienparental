'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Bandeau de logos qui défile en continu (maquette client). La piste est dupliquée pour une
 * boucle sans à-coup ; la copie est `inert` et masquée aux lecteurs d'écran (pas de doublons au
 * clavier). Défilement suspendu au survol et au focus, bouton pause permanent (WCAG 2.2.2).
 * prefers-reduced-motion : pas d'animation, rangée défilable à la main.
 */
export function PartnerMarquee({ children, pauseLabel, playLabel, speed = 40, className }: {
  children: ReactNode
  pauseLabel: string
  playLabel: string
  /** Durée d'un tour complet, en secondes. */
  speed?: number
  className?: string
}) {
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  if (reduced) {
    return (
      <ul className={cn('flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] sm:gap-4', className)}>
        {children}
      </ul>
    )
  }

  return (
    <div className={cn('group/marquee', className)}>
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]">
        <div
          className="flex w-max animate-[partner-marquee_var(--marquee-duration)_linear_infinite] group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused]"
          style={{ '--marquee-duration': `${speed}s`, animationPlayState: paused ? 'paused' : undefined } as React.CSSProperties}
        >
          <ul className="flex shrink-0 gap-3 pr-3 sm:gap-4 sm:pr-4">{children}</ul>
          <ul aria-hidden inert className="flex shrink-0 gap-3 pr-3 sm:gap-4 sm:pr-4">{children}</ul>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? playLabel : pauseLabel}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-night-800 shadow-[0_4px_14px_rgba(11,45,91,0.12)] ring-1 ring-[#E5E7EB] hover:bg-night-50"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <style>{'@keyframes partner-marquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}'}</style>
    </div>
  )
}
