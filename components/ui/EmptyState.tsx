import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

type Props = {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  tone?: 'default' | 'iris' | 'leaf' | 'gold'
}

export function EmptyState({ icon, title, description, action, secondaryAction, className, tone = 'default' }: Props) {
  const halo =
    tone === 'iris' ? 'bg-iris-100 text-iris-600' :
    tone === 'leaf' ? 'bg-leaf-100 text-leaf-600' :
    tone === 'gold' ? 'bg-gold-100 text-gold-600' :
    'bg-night-100 text-night-600 dark:bg-night-800 dark:text-night-200'

  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-10 gap-4', className)}>
      {icon && (
        <div className={cn('flex h-16 w-16 items-center justify-center rounded-full', halo)} aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-xs">
        <h3 className="font-display text-lg text-night-900 dark:text-night-50">{title}</h3>
        {description && <p className="text-sm text-night-500 dark:text-night-300">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full max-w-xs">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  )
}
