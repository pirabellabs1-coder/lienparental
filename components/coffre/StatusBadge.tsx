import { cn } from '@/lib/cn'

type Kind = 'attente' | 'termine' | 'attente-iris' | 'populaire' | 'nouveau' | 'modele'

const STYLES: Record<Kind, string> = {
  attente: 'bg-orange-50 text-orange-700 uppercase tracking-wide',
  termine: 'bg-leaf-50 text-leaf-600 uppercase tracking-wide',
  'attente-iris': 'bg-iris-50 text-iris-600',
  populaire: 'bg-leaf-50 text-leaf-600',
  nouveau: 'bg-iris-50 text-iris-600',
  modele: 'bg-leaf-50 text-leaf-600',
}

const LABELS: Record<Kind, string> = {
  attente: 'En attente',
  termine: 'Terminé',
  'attente-iris': 'En attente',
  populaire: 'Populaire',
  nouveau: 'Nouveau',
  modele: 'Modèle complet',
}

/** Petite étiquette de statut (couleur + texte : l'information ne repose jamais sur la couleur seule). */
export function StatusBadge({ kind, children, className }: { kind: Kind; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold', STYLES[kind], className)}>
      {children ?? LABELS[kind]}
    </span>
  )
}
