'use client'
import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  hint?: string
  error?: string
  mode?: 'date' | 'datetime-local' | 'time' | 'month'
  containerClassName?: string
}

export const DatePicker = forwardRef<HTMLInputElement, Props>(function DatePicker(
  { id, label, hint, error, mode = 'date', className, containerClassName, required, lang = 'fr-FR', ...props }, ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-night-900 dark:text-night-50 mb-1.5">
          {label}
          {required && <span className="text-alert-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={mode}
          lang={lang}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'w-full min-h-[48px] rounded-xl bg-white dark:bg-night-900 border border-night-200 dark:border-night-700',
            'px-4 pr-11 py-3 text-base text-night-900 dark:text-night-50',
            'shadow-soft transition-colors',
            'focus-visible:border-leaf-500 focus-visible:outline-none',
            'disabled:bg-night-50 disabled:text-night-400 disabled:cursor-not-allowed',
            '[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-11 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer',
            error && 'border-alert-400 focus-visible:border-alert-500',
            className
          )}
          {...props}
        />
        <Calendar className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-night-400" aria-hidden="true" />
      </div>
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-night-500 dark:text-night-300">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{error}</p>}
    </div>
  )
})
