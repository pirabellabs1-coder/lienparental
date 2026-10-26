import { cn } from '@/lib/cn'
import type { JournalType } from '@/lib/mock-data'
import { JOURNAL_TYPES } from './journalTypes'

type Props = {
  type: JournalType
  withLabel?: boolean
  withIcon?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Badge doux du type (« Visite ») — style maquette Détail de l'événement. */
export function EventTypePill({ type, withLabel = true, withIcon = false, size = 'md', className }: Props) {
  const c = JOURNAL_TYPES[type]
  const Icon = c.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-semibold',
        c.bg, c.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      {withIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />}
      {withLabel && <span>{c.label}</span>}
    </span>
  )
}

export function eventTypeDot(type: JournalType): string {
  return JOURNAL_TYPES[type].dot
}
