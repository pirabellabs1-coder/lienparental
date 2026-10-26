'use client'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  label?: ReactNode
  description?: ReactNode
  containerClassName?: string
}

export const Switch = forwardRef<HTMLInputElement, Props>(function Switch(
  { id, label, description, className, containerClassName, disabled, ...props }, ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const descId = `${inputId}-desc`

  return (
    <label htmlFor={inputId} className={cn('flex items-center justify-between gap-4 min-h-[48px] py-2 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-50', containerClassName)}>
      <span className="min-w-0 flex-1">
        {label && <span className="block text-sm font-medium text-night-900 dark:text-night-50">{label}</span>}
        {description && <span id={descId} className="block mt-0.5 text-xs text-night-500 dark:text-night-300">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          id={inputId}
          disabled={disabled}
          aria-describedby={description ? descId : undefined}
          className={cn('peer sr-only', className)}
          {...props}
        />
        <span aria-hidden="true" className={cn(
          'h-7 w-12 rounded-full bg-night-200 dark:bg-night-700 transition-colors',
          'peer-checked:bg-leaf-500',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-leaf-400'
        )} />
        <span aria-hidden="true" className={cn(
          'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200',
          'peer-checked:translate-x-5'
        )} />
      </span>
    </label>
  )
})
