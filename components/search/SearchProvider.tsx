'use client'

import type { ReactNode } from 'react'
import { CommandPalette } from './CommandPalette'

/**
 * Monte la palette de recherche une seule fois pour tout l'espace /app.
 * À placer dans app/app/layout.tsx : `<SearchProvider />` (ou en enveloppe autour des enfants).
 * Les boutons l'ouvrent via `window.dispatchEvent(new Event('lp:open-search'))` (cf. SearchTrigger).
 */
export function SearchProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
    </>
  )
}
