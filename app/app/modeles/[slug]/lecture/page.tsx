'use client'

import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronRight, Download, Maximize2, Minus, Plus, Search, X } from 'lucide-react'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { LetterSheet } from '@/components/coffre/LetterSheet'
import { headerIconBtn } from '@/components/coffre/ScreenHeader'
import { btn } from '@/components/coffre/buttons'
import { StickyActions } from '@/components/coffre/StickyActions'
import { getModele, modelePages } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

const ZOOMS = [0.85, 1, 1.15, 1.3, 1.5]

// Maquette « Lecture du document »
export default function LecturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const tr = useTranslations('coach.templates.reader')
  const found = getModele(slug)

  const [zoomIdx, setZoomIdx] = useState(1)
  const [current, setCurrent] = useState(1)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [canFullscreen, setCanFullscreen] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setCanFullscreen(Boolean(document.fullscreenEnabled)) }, [])
  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])

  // Page courante = page qui occupe le centre de l'écran.
  useEffect(() => {
    const els = pageRefs.current.filter((x): x is HTMLDivElement => !!x)
    if (els.length === 0) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.page))
    }, { rootMargin: '-45% 0px -50% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [found])

  if (!found) notFound()
  const m = found
  const pages = modelePages(m)

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await viewerRef.current?.requestFullscreen()
    } catch { /* refusé par le navigateur */ }
  }

  return (
    <>
      <header
        className="sticky top-0 z-30 bg-white px-4"
        data-safe-top style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="flex items-start gap-1 pb-2">
          <Link href={`/app/modeles/${m.slug}`} aria-label={tr('back')} className={cn(headerIconBtn, '-ml-2 shrink-0')}>
            <ArrowLeft className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1 pt-1 text-center">
            <h1 className="line-clamp-2 text-[15px] font-extrabold leading-snug text-night-900">{m.title}</h1>
            <StatusBadge kind="modele" className="mt-1.5">{m.kind}</StatusBadge>
          </div>
          <button
            type="button"
            onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery('') }}
            aria-expanded={searchOpen}
            aria-controls="doc-search"
            aria-label={searchOpen ? tr('closeSearch') : tr('search')}
            className={cn(headerIconBtn, '-mr-2 shrink-0')}
          >
            {searchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {searchOpen && (
          <div id="doc-search" role="search" className="pb-2">
            <label htmlFor="doc-search-input" className="sr-only">{tr('search')}</label>
            <input
              id="doc-search-input"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('searchPlaceholder')}
              className="h-11 w-full rounded-xl border border-night-200 px-3.5 text-[14px] outline-none focus:border-leaf-500"
            />
          </div>
        )}

        <div className="flex h-12 items-center justify-between border-y border-night-100">
          <p className="text-[13px] font-semibold text-night-800" aria-live="polite">
            <span className="sr-only">{tr('page')}</span>{current} / {pages}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
              aria-label={tr('zoomOut')}
              className={cn(headerIconBtn, 'disabled:opacity-30')}
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))}
              disabled={zoomIdx === ZOOMS.length - 1}
              aria-label={tr('zoomIn')}
              className={cn(headerIconBtn, 'disabled:opacity-30')}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
            {canFullscreen && (
              <button type="button" onClick={() => void toggleFullscreen()} aria-label={tr('fullscreen')} className={cn(headerIconBtn, '-mr-2')}>
                <Maximize2 className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div ref={viewerRef} className="overflow-x-auto bg-night-50/50 px-4 py-4 [&:fullscreen]:overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4" style={{ fontSize: `${12 * ZOOMS[zoomIdx]}px` }}>
          {Array.from({ length: pages }, (_, i) => (
            <div key={i} ref={(el) => { pageRefs.current[i] = el }} data-page={i + 1} aria-label={tr('pageOf', { page: i + 1, total: pages })} role="region">
              <LetterSheet modele={m} page={i} query={query} className="min-h-[60vh]" />
            </div>
          ))}
        </div>
      </div>

      <StickyActions>
        <Link href={`/app/modeles/${m.slug}/export`} className={btn({ variant: 'primary' })}>
          <Download className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="flex-1 text-center">{tr('download')}</span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </StickyActions>
    </>
  )
}
