'use client'
import Image from 'next/image'
import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CARD } from './ui'
import type { Testimonial } from './testimonials'

// Carrousel accessible : liste défilante (scroll-snap, clavier et tactile natifs) + boutons précédent / suivant.
export function TestimonialCarousel({ items }: { items: Testimonial[] }) {
  const track = useRef<HTMLUListElement>(null)
  const scroll = (dir: number) => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' })
  }
  return (
    <div className="mt-10">
      <ul ref={track} aria-label="Témoignages" className="home-scroll -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
        {items.map(t => (
          <li key={t.firstName + t.quote.slice(0, 20)} className="w-[86%] shrink-0 snap-start sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
            <figure className={cn(CARD, 'flex h-full flex-col p-6')}>
              <Quote className="h-6 w-6 text-leaf-400" aria-hidden />
              <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-night-800">« {t.quote} »</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                {t.avatar ? (
                  <Image src={t.avatar} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-leaf-50 text-[16px] font-bold text-leaf-700">{t.firstName.charAt(0)}</span>
                )}
                <span>
                  <span className="block text-[15px] font-bold text-night-900">{t.firstName}</span>
                  <span className="block text-[13px] text-night-600">{t.profile}</span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => scroll(-1)} aria-label="Témoignages précédents" className="grid h-12 w-12 place-items-center rounded-full bg-white ring-1 ring-night-900/20 hover:bg-night-50">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label="Témoignages suivants" className="grid h-12 w-12 place-items-center rounded-full bg-white ring-1 ring-night-900/20 hover:bg-night-50">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
