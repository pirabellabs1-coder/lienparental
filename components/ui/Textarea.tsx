'use client'
import { forwardRef, useId, useState, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: string
  error?: string
  maxLength?: number
  showCounter?: boolean
  containerClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { id, label, hint, error, maxLength, showCounter = true, className, containerClassName, required, defaultValue, value, onChange, ...props }, ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const counterId = `${inputId}-counter`

  const [internal, setInternal] = useState<string>(() => (defaultValue ?? value ?? '').toString())
  const current = value !== undefined ? value.toString() : internal
  const length = current.length
  const describedBy = [hint ? hintId : null, error ? errorId : null, maxLength && showCounter ? counterId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-night-900 dark:text-night-50 mb-1.5">
          {label}
          {required && <span className="text-alert-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={4}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => { if (value === undefined) setInternal(e.target.value); onChange?.(e) }}
        className={cn(
          'w-full min-h-[120px] rounded-xl bg-white dark:bg-night-900 border border-night-200 dark:border-night-700',
          'px-4 py-3 text-base text-night-900 dark:text-night-50 placeholder:text-night-400',
          'resize-y shadow-soft transition-colors',
          'focus-visible:border-leaf-500 focus-visible:outline-none',
          'disabled:bg-night-50 dark:disabled:bg-night-800 disabled:text-night-400',
          error && 'border-alert-400 focus-visible:border-alert-500',
          className
        )}
        {...props}
      />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {hint && !error && <p id={hintId} className="text-xs text-night-500 dark:text-night-300">{hint}</p>}
          {error && <p id={errorId} role="alert" className="text-xs font-medium text-alert-500">{error}</p>}
        </div>
        {maxLength && showCounter && (
          <p
            id={counterId}
            className={cn(
              'shrink-0 text-xs tabular-nums',
              length >= maxLength ? 'text-alert-500 font-medium' : length / maxLength >= 0.9 ? 'text-gold-400' : 'text-night-400'
            )}
            aria-live="polite"
          >
            {length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  )
})
