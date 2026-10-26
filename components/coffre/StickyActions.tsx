import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Zone d'actions collée en bas de la colonne de contenu (CTA « Continuer », « Enregistrer »…).
 * `sticky` (et non `fixed`) : elle suit la largeur de la colonne, mobile comme desktop.
 * Sur mobile elle se cale au-dessus de la BottomNav (4rem + safe-area).
 */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-sticky-actions
      className={cn(
        'sticky z-20 mt-8 bg-gradient-to-t from-white via-white to-white/0 px-5 pb-3 pt-6',
        'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0',
        className,
      )}
    >
      <div className="mx-auto w-full md:max-w-md">{children}</div>
    </div>
  )
}
