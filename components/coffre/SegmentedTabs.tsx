'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

type Tab<K extends string> = { key: K; label: string; count?: number }

type Props<K extends string> = {
  tabs: Tab<K>[]
  value: K
  onChange: (k: K) => void
  label: string
  /** Préfixe d'id pour relier onglets et panneau (aria-controls). */
  idPrefix: string
  className?: string
}

/** Onglets segmentés accessibles (flèches gauche/droite, Début/Fin). Sélection = vert (docs/DESIGN_SYSTEM.md). */
export function SegmentedTabs<K extends string>({ tabs, value, onChange, label, idPrefix, className }: Props<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].key)
    refs.current[next]?.focus()
  }

  const active = 'bg-leaf-500 text-white shadow-[0_6px_14px_-8px_rgba(46,125,50,0.8)]'
  const activeCount = 'bg-white text-leaf-600'

  return (
    <div role="tablist" aria-label={label} className={cn('grid grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-night-50 p-1', className)}>
      {tabs.map((t, i) => {
        const selected = t.key === value
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
              selected ? active : 'text-night-600 hover:text-night-900',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cn('min-w-[22px] rounded-full px-1.5 py-0.5 text-[11px] font-extrabold', selected ? activeCount : 'bg-night-200/70 text-night-600')}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
