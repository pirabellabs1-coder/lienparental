import { useTranslations } from 'next-intl'
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

/** Clés de libellés (vault.ui.status.*). */
const LABEL_KEYS: Record<Kind, string> = {
  attente: 'attente',
  termine: 'termine',
  'attente-iris': 'attente',
  populaire: 'populaire',
  nouveau: 'nouveau',
  modele: 'modele',
}

/** Petite étiquette de statut (couleur + texte : l'information ne repose jamais sur la couleur seule). */
export function StatusBadge({ kind, children, className }: { kind: Kind; children?: React.ReactNode; className?: string }) {
  const t = useTranslations('vault.ui.status')
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold', STYLES[kind], className)}>
      {children ?? t(LABEL_KEYS[kind])}
    </span>
  )
}
