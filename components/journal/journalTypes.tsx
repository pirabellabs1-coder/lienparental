import { CalendarDays, Video, MessageCircleMore, Stethoscope, Ellipsis, ReceiptText, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { JournalType } from '@/lib/mock-data'

// Types du journal (maquette « Journal ») : icône + couleur douce par type.
export type JournalTypeConfig = {
  label: string
  /** Libellé du filtre (pluriel) */
  filter: string
  icon: LucideIcon
  /** Fond doux du cercle d'icône */
  bg: string
  /** Couleur de l'icône */
  iconColor: string
  /** Couleur du grand numéro de jour (≥ 3:1, texte large gras) */
  dayColor: string
  /** Pastille */
  dot: string
  /** Texte de badge AA sur `bg` */
  text: string
}

export const JOURNAL_TYPES: Record<JournalType, JournalTypeConfig> = {
  visite:  { label: 'Visite',  filter: 'Visites',  icon: CalendarDays,      bg: 'bg-leaf-50',   iconColor: 'text-leaf-600',   dayColor: 'text-leaf-600',   dot: 'bg-leaf-500',   text: 'text-leaf-700' },
  appel:   { label: 'Appel',   filter: 'Appels',   icon: Video,             bg: 'bg-blue-50',   iconColor: 'text-blue-600',   dayColor: 'text-blue-600',   dot: 'bg-blue-500',   text: 'text-blue-700' },
  message: { label: 'Message', filter: 'Messages', icon: MessageCircleMore, bg: 'bg-orange-50', iconColor: 'text-orange-500', dayColor: 'text-orange-600', dot: 'bg-orange-500', text: 'text-orange-700' },
  sante:   { label: 'Santé',   filter: 'Santé',    icon: Stethoscope,       bg: 'bg-purple-50', iconColor: 'text-purple-600', dayColor: 'text-purple-600', dot: 'bg-purple-500', text: 'text-purple-700' },
  depense: { label: 'Dépense / Paiement', filter: 'Finances', icon: ReceiptText, bg: 'bg-teal-50', iconColor: 'text-teal-700', dayColor: 'text-teal-700', dot: 'bg-teal-600', text: 'text-teal-800' },
  autre:   { label: 'Autre',   filter: 'Autres',   icon: Ellipsis,          bg: 'bg-slate-100', iconColor: 'text-slate-600',  dayColor: 'text-slate-600',  dot: 'bg-slate-400',  text: 'text-slate-700' },
}

export const JOURNAL_TYPE_ORDER: JournalType[] = ['visite', 'appel', 'message', 'sante', 'depense', 'autre']

const SIZES = {
  sm: { box: 'h-9 w-9', icon: 'h-[18px] w-[18px]' },
  md: { box: 'h-11 w-11', icon: 'h-5 w-5' },
  lg: { box: 'h-[76px] w-[76px]', icon: 'h-9 w-9' },
} as const

export function JournalTypeIcon({ type, size = 'md', className }: {
  type: JournalType; size?: keyof typeof SIZES; className?: string
}) {
  const c = JOURNAL_TYPES[type]
  const Icon = c.icon
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full', SIZES[size].box, c.bg, c.iconColor, className)}>
      <Icon className={SIZES[size].icon} strokeWidth={1.9} />
    </span>
  )
}
