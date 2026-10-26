'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OPEN_SEARCH_EVENT } from './CommandPalette'

type Props = {
  /** "sidebar" : champ pleine largeur (ordinateur). "icon" : bouton rond 44px (en-têtes mobiles). */
  variant?: 'sidebar' | 'icon'
  className?: string
}

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}

export function SearchTrigger({ variant = 'sidebar', className }: Props) {
  // Le raccourci affiché s'adapte au Mac après hydratation (rendu serveur : « Ctrl K »).
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent))
  }, [])

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={openSearch}
        aria-label="Rechercher"
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-night-100 bg-white text-night-900 transition-colors hover:bg-night-50',
          className,
        )}
      >
        <Search aria-hidden className="h-5 w-5" strokeWidth={2} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-xl border border-night-200 bg-white px-3 text-left text-[14px] text-night-500 transition-colors hover:border-night-300 hover:text-night-700',
        className,
      )}
    >
      <Search aria-hidden className="h-4 w-4 shrink-0 text-night-400" strokeWidth={2.2} />
      <span className="min-w-0 flex-1 truncate">Rechercher…</span>
      <kbd aria-hidden className="shrink-0 rounded-md border border-night-200 bg-night-50 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-night-600">
        {isMac ? '⌘ K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}
