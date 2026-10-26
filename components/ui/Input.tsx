'use client'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  containerClassName?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { id, label, hint, error, leadingIcon, trailingIcon, className, containerClassName, required, ...props }, ref
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
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-night-400" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'w-full min-h-[48px] rounded-xl bg-white dark:bg-night-900 border border-night-200 dark:border-night-700',
            'px-4 py-3 text-base text-night-900 dark:text-night-50 placeholder:text-night-400',
            'transition-colors shadow-soft',
            'focus-visible:border-leaf-500 focus-visible:outline-none',
            'disabled:bg-night-50 dark:disabled:bg-night-800 disabled:text-night-400 disabled:cursor-not-allowed',
            leadingIcon && 'pl-11',
            trailingIcon && 'pr-11',
            error && 'border-alert-400 focus-visible:border-alert-500',
            className
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-night-400" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-night-500 dark:text-night-300">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{error}</p>
      )}
    </div>
  )
})
