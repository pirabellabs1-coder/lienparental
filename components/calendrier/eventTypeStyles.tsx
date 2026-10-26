import {
  CalendarDays, Video, MessageCircleMore, Stethoscope, ClipboardList, School,
  Trees, Tent, Utensils, Car, Cake, Ellipsis, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { getEventType, type EventIconKey, type EventTypeKey } from '@/lib/calendrier'

// Couleurs des 12 types (maquette « Calendrier — parcours complet »).
// Les classes vivent ici (et non dans lib/) car Tailwind ne scanne que app/ et components/.
export type EventTypeStyle = {
  /** Fond doux : tuile, cercle d'icône, bloc semaine */
  bg: string
  /** Texte AA sur `bg` */
  text: string
  /** Couleur de l'icône */
  icon: string
  /** Bordure douce */
  border: string
  /** Anneau de sélection */
  ring: string
  /** Pastille */
  dot: string
}

export const EVENT_TYPE_STYLES: Record<EventTypeKey, EventTypeStyle> = {
  visite:       { bg: 'bg-leaf-50',    text: 'text-leaf-700',    icon: 'text-leaf-600',    border: 'border-leaf-100',    ring: 'ring-leaf-500',    dot: 'bg-leaf-500' },
  appel:        { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'text-blue-600',    border: 'border-blue-100',    ring: 'ring-blue-500',    dot: 'bg-blue-500' },
  message:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: 'text-orange-500',  border: 'border-orange-100',  ring: 'ring-orange-500',  dot: 'bg-orange-500' },
  sante:        { bg: 'bg-purple-50',  text: 'text-purple-700',  icon: 'text-purple-600',  border: 'border-purple-100',  ring: 'ring-purple-500',  dot: 'bg-purple-500' },
  rdv:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: 'text-rose-500',    border: 'border-rose-100',    ring: 'ring-rose-500',    dot: 'bg-rose-500' },
  ecole:        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: 'text-sky-600',     border: 'border-sky-100',     ring: 'ring-sky-500',     dot: 'bg-sky-500' },
  activite:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600', border: 'border-emerald-100', ring: 'ring-emerald-500', dot: 'bg-emerald-500' },
  sortie:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: 'text-amber-500',   border: 'border-amber-100',   ring: 'ring-amber-500',   dot: 'bg-amber-500' },
  repas:        { bg: 'bg-red-50',     text: 'text-red-700',     icon: 'text-red-500',     border: 'border-red-100',     ring: 'ring-red-500',     dot: 'bg-red-500' },
  deplacement:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  icon: 'text-indigo-500',  border: 'border-indigo-100',  ring: 'ring-indigo-500',  dot: 'bg-indigo-500' },
  anniversaire: { bg: 'bg-pink-50',    text: 'text-pink-700',    icon: 'text-pink-500',    border: 'border-pink-100',    ring: 'ring-pink-500',    dot: 'bg-pink-500' },
  autre:        { bg: 'bg-slate-50',   text: 'text-slate-700',   icon: 'text-slate-500',   border: 'border-slate-200',   ring: 'ring-slate-500',   dot: 'bg-slate-400' },
}

export const EVENT_ICONS: Record<EventIconKey, LucideIcon> = {
  calendar: CalendarDays,
  video: Video,
  message: MessageCircleMore,
  stethoscope: Stethoscope,
  clipboard: ClipboardList,
  school: School,
  trees: Trees,
  tent: Tent,
  utensils: Utensils,
  car: Car,
  cake: Cake,
  more: Ellipsis,
}

export function typeStyle(key: EventTypeKey): EventTypeStyle {
  return EVENT_TYPE_STYLES[key] ?? EVENT_TYPE_STYLES.autre
}

export function typeIcon(key: EventTypeKey): LucideIcon {
  return EVENT_ICONS[getEventType(key).icon]
}

const SIZES = {
  sm: { box: 'h-9 w-9', icon: 'h-[18px] w-[18px]' },
  md: { box: 'h-11 w-11', icon: 'h-5 w-5' },
  lg: { box: 'h-[72px] w-[72px]', icon: 'h-8 w-8' },
} as const

/** Icône du type dans un cercle teinté (listes, détail). Décorative. */
export function EventTypeIcon({
  type, size = 'md', className,
}: { type: EventTypeKey; size?: keyof typeof SIZES; className?: string }) {
  const s = typeStyle(type)
  const Icon = typeIcon(type)
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full', SIZES[size].box, s.bg, s.icon, className)}
    >
      <Icon className={SIZES[size].icon} strokeWidth={1.9} />
    </span>
  )
}

/** Badge doux « Visite » (détail). */
export function EventTypeBadge({ type, className }: { type: EventTypeKey; className?: string }) {
  const s = typeStyle(type)
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold', s.bg, s.text, className)}>
      {getEventType(type).label}
    </span>
  )
}
