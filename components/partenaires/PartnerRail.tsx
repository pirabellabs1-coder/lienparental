'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Rangée de cartes partenaires défilant horizontalement (scroll-snap natif : doigt, molette,
 * clavier). Les flèches et les points n'apparaissent que si la rangée déborde ; défilement
 * instantané en prefers-reduced-motion.
 */
export function PartnerRail({ children, count, prevLabel, nextLabel, tone }: {
  children: ReactNode
  count: number
  prevLabel: string
  nextLabel: string
  tone: 'night' | 'leaf' | 'pink'
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [state, setState] = useState({ overflow: false, start: true, end: false, page: 0, pages: 1 })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const pages = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth)))
    setState({
      overflow: max > 4,
      start: el.scrollLeft <= 4,
      end: el.scrollLeft >= max - 4,
      page: max > 0 ? Math.round((el.scrollLeft / max) * (pages - 1)) : 0,
      pages,
    })
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

  const go = (dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' })
  }

  const arrow = 'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-night-900 shadow-[0_4px_14px_rgba(11,45,91,0.14)] ring-1 ring-[#E5E7EB] transition-opacity hover:bg-night-50 disabled:pointer-events-none disabled:opacity-0 sm:flex'
  const dot = { night: 'bg-night-600', leaf: 'bg-leaf-500', pink: 'bg-pink-500' }[tone]

  return (
    <div className="relative">
      {state.overflow && (
        <button type="button" onClick={() => go(-1)} disabled={state.start} aria-label={prevLabel} className={cn(arrow, '-left-3')}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      <ul
        ref={ref}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {state.overflow && (
        <button type="button" onClick={() => go(1)} disabled={state.end} aria-label={nextLabel} className={cn(arrow, '-right-3')}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      )}
      {state.overflow && state.pages > 1 && (
        <div aria-hidden className="mt-4 flex justify-center gap-2">
          {Array.from({ length: state.pages }, (_, i) => (
            <span key={i} className={cn('h-2.5 w-2.5 rounded-full transition-colors', i === state.page ? dot : 'bg-night-200')} />
          ))}
        </div>
      )}
    </div>
  )
}
