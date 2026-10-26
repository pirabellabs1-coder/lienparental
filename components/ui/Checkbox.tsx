'use client'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode
  description?: ReactNode
  error?: string
  containerClassName?: string
}

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { id, label, description, error, className, containerClassName, disabled, ...props }, ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const descId = `${inputId}-desc`
  const errorId = `${inputId}-error`
  const describedBy = [description ? descId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('relative', containerClassName)}>
      <label htmlFor={inputId} className={cn('flex items-start gap-3 min-h-[44px] py-2 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-50')}>
        <span className="relative flex items-center justify-center shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn('peer appearance-none h-6 w-6 rounded-lg border-2 border-night-300 dark:border-night-600 bg-white dark:bg-night-900',
              'checked:bg-leaf-500 checked:border-leaf-500',
              'focus-visible:outline-none transition-colors cursor-pointer',
              error && 'border-alert-400',
              className
            )}
            {...props}
          />
          <Check className="pointer-events-none absolute h-4 w-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {label && <span className="block text-sm font-medium text-night-900 dark:text-night-50 leading-tight">{label}</span>}
          {description && <span id={descId} className="block mt-0.5 text-xs text-night-500 dark:text-night-300">{description}</span>}
        </span>
      </label>
      {error && <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-alert-500">{error}</p>}
    </div>
  )
})
