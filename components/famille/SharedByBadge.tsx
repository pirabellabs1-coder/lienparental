import { UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Badge « Partagé par {prénom} » (docs/FAMILLE.md) : élément d'un autre adulte lié,
 * affiché en lecture seule. Texte explicite (pas seulement une couleur).
 */
export function SharedByBadge({ prenom, className }: { prenom: string; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-md bg-leaf-50 px-1.5 py-0.5 text-[10.5px] font-bold text-leaf-800', className)}>
      <UsersRound aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span className="truncate">Partagé par {prenom}</span>
    </span>
  )
}
