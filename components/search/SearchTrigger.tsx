'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations('account.search')
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={openSearch}
        aria-label={t('trigger')}
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
      // Même gabarit que les liens du menu (h-11, rounded-xl) ; raccourci clavier conservé mais non affiché.
      className={cn(
        'group flex h-11 w-full items-center gap-3 rounded-xl bg-night-50 px-3 text-left text-[14px] font-medium text-night-500 ring-1 ring-inset ring-night-100 transition-colors hover:bg-white hover:text-night-800 hover:ring-night-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
        className,
      )}
    >
      <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-night-400 transition-colors group-hover:text-night-700" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate">{t('triggerPlaceholder')}</span>
    </button>
  )
}
