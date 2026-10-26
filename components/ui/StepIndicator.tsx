import { cn } from '@/lib/cn'
import { Check } from 'lucide-react'

type Props = {
  current: number
  total: number
  labels?: string[]
  variant?: 'dots' | 'pills' | 'numbered'
  className?: string
}

export function StepIndicator({ current, total, labels, variant = 'pills', className }: Props) {
  const steps = Array.from({ length: total }, (_, i) => i + 1)
  const label = labels?.[current - 1]

  return (
    <div className={cn('w-full', className)} role="group" aria-label={`Étape ${current} sur ${total}${label ? ` : ${label}` : ''}`}>
      {variant === 'dots' && (
        <div className="flex items-center justify-center gap-2">
          {steps.map(i => (
            <span
              key={i}
              aria-current={i === current ? 'step' : undefined}
              className={cn(
                'rounded-full transition-all duration-200',
                i < current ? 'h-2 w-2 bg-leaf-500' : i === current ? 'h-2 w-6 bg-leaf-500' : 'h-2 w-2 bg-night-200 dark:bg-night-700'
              )}
            />
          ))}
        </div>
      )}

      {variant === 'pills' && (
        <>
          <div className="flex items-center gap-1.5">
            {steps.map(i => (
              <span
                key={i}
                aria-current={i === current ? 'step' : undefined}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i <= current ? 'bg-leaf-500' : 'bg-night-200 dark:bg-night-700'
                )}
              />
            ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-night-500 dark:text-night-300 tabular-nums">Étape {current}/{total}</p>
            {label && <p className="text-xs font-semibold text-night-900 dark:text-night-50 truncate">{label}</p>}
          </div>
        </>
      )}

      {variant === 'numbered' && (
        <ol className="flex items-center gap-2">
          {steps.map((i, idx) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'upcoming'
            return (
              <li key={i} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    state === 'done' && 'bg-leaf-50 text-leaf-600 ring-1 ring-inset ring-leaf-200',
                    state === 'current' && 'bg-leaf-500 text-white',
                    state === 'upcoming' && 'bg-night-100 dark:bg-night-800 text-night-500'
                  )}
                >
                  {state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : i}
                </span>
                {idx < steps.length - 1 && (
                  <span className={cn('h-0.5 flex-1 rounded-full', i < current ? 'bg-leaf-500' : 'bg-night-200 dark:bg-night-700')} />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
