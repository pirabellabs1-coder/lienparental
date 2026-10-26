import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { getEventType, type EventTypeKey } from '@/lib/calendrier'
import { typeIcon, typeStyle } from './eventTypeStyles'

type Props = {
  type: EventTypeKey
  label?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  withIcon?: boolean
}

/** Pastille de type (fond doux + texte AA). */
export function EventPill({ type, label, size = 'sm', className, withIcon = true }: Props) {
  const s = typeStyle(type)
  const Icon = typeIcon(type)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md font-semibold',
        s.bg, s.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      {withIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />}
      {label ?? getEventType(type).label}
    </span>
  )
}
