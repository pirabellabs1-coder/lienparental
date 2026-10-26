'use client'

import { useEffect, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Tip } from '@/lib/mock-data'

type Props = { tips: Tip[] }

// M03 — Conseil du jour : carte verte claire, carrousel à points.
export function DailyTip({ tips }: Props) {
  const [index, setIndex] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const go = (i: number) => {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(tips.length - 1, i))
    setIndex(clamped)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }

  // Synchronise l'index avec les swipes manuels (rAF = 1 lecture par frame).
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  if (tips.length === 0) return null

  return (
    <div aria-roledescription="carrousel" aria-label="Conseils du jour" className="rounded-xl2 bg-leaf-50 pb-1 pt-4">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {tips.map((t, i) => (
          <article
            key={t.id}
            aria-roledescription="diapositive"
            aria-label={`${i + 1} sur ${tips.length}`}
            className="flex w-full shrink-0 snap-center gap-3.5 px-4"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-leaf-600 shadow-soft" aria-hidden="true">
              <Lightbulb className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-bold text-night-900">{t.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-800">{t.body}</p>
            </div>
          </article>
        ))}
      </div>

      {tips.length > 1 && (
        <div className="mt-1 flex justify-center" role="group" aria-label="Choisir un conseil">
          {tips.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-label={`Conseil ${i + 1} : ${t.title}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
              className="grid h-8 w-5 place-items-center"
            >
              <span
                aria-hidden="true"
                className={cn('h-1.5 w-1.5 rounded-full transition-colors', i === index ? 'bg-leaf-500' : 'bg-night-200')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
