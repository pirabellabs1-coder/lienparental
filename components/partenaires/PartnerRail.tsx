'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Carrousel de cartes partenaires (maquette client : flèches de part et d'autre, points dessous).
 * Scroll-snap natif (doigt, molette, clavier). Avec `autoplay`, avance d'une carte toutes les
 * quelques secondes et revient au début en fin de rangée ; suspendu au survol, au focus, onglet
 * masqué, et par un bouton pause (WCAG 2.2.2). prefers-reduced-motion : sauts instantanés, sans
 * glissement. Flèches, points et pause n'apparaissent que si la rangée déborde.
 */
export function PartnerRail({ children, count, prevLabel, nextLabel, pauseLabel, playLabel, tone, autoplay = false, interval = 3500 }: {
  children: ReactNode
  count: number
  prevLabel: string
  nextLabel: string
  pauseLabel?: string
  playLabel?: string
  tone: 'night' | 'leaf' | 'pink'
  autoplay?: boolean
  /** Délai entre deux avancées automatiques, en millisecondes. */
  interval?: number
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [state, setState] = useState({ overflow: false, page: 0, pages: 1 })
  const [paused, setPaused] = useState(false)
  const [hold, setHold] = useState(false)
  const [reduced, setReduced] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const pages = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth)))
    setState({ overflow: max > 4, page: max > 0 ? Math.round((el.scrollLeft / max) * (pages - 1)) : 0, pages })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure) }
  }, [measure, count])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /** Avance (ou recule) d'une carte ; en bout de rangée, repart de l'autre extrémité. */
  const go = useCallback((dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const first = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const step = first ? first.offsetWidth + gap : el.clientWidth * 0.9
    const behavior = reduced ? 'auto' : 'smooth'
    if (dir === 1 && el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior })
    else if (dir === -1 && el.scrollLeft <= 4) el.scrollTo({ left: max, behavior })
    else el.scrollBy({ left: dir * step, behavior })
  }, [reduced])

  // Avec prefers-reduced-motion, l'avance automatique continue mais par sauts, sans glissement.
  const running = autoplay && state.overflow && !paused && !hold
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => { if (!document.hidden) go(1) }, interval)
    return () => window.clearInterval(id)
  }, [running, go, interval])

  const arrow = 'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-night-900 shadow-[0_4px_14px_rgba(11,45,91,0.14)] ring-1 ring-[#E5E7EB] hover:bg-night-50 sm:flex'
  const dot = { night: 'bg-night-600', leaf: 'bg-leaf-500', pink: 'bg-pink-500' }[tone]

  return (
    <div
      className="relative"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false) }}
    >
      {state.overflow && (
        <button type="button" onClick={() => go(-1)} aria-label={prevLabel} className={cn(arrow, '-left-3 sm:-left-5')}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      <ul
        ref={ref}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {state.overflow && (
        <button type="button" onClick={() => go(1)} aria-label={nextLabel} className={cn(arrow, '-right-3 sm:-right-5')}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      )}
      {state.overflow && (
        <div className="mt-4 flex items-center justify-center gap-3">
          {state.pages > 1 && (
            <span aria-hidden className="flex gap-2">
              {Array.from({ length: state.pages }, (_, i) => (
                <span key={i} className={cn('h-2.5 w-2.5 rounded-full transition-colors', i === state.page ? dot : 'bg-night-200')} />
              ))}
            </span>
          )}
          {autoplay && pauseLabel && playLabel && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={paused ? playLabel : pauseLabel}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-600 hover:bg-white hover:text-night-900"
            >
              {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
