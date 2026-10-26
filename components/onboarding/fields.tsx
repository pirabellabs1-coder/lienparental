'use client'

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Light form fields matching the onboarding / witness / child-profile mockups:
 * small bold label, 48px-high soft-bordered control, green focus.
 * Shared by components/onboarding, components/enfants and app/temoin.
 */

export const fieldControl =
  'w-full rounded-xl border border-night-100 bg-white text-base text-night-900 shadow-[0_1px_2px_rgba(11,45,91,0.04)] outline-none transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-night-400 focus:border-leaf-500 focus:ring-4 focus:ring-leaf-100 disabled:bg-night-50 disabled:text-night-400 aria-[invalid=true]:border-alert-400'

type Common = {
  label: ReactNode
  /** Visible "(facultatif)" suffix. */
  optional?: boolean
  hint?: ReactNode
  error?: string
  icon?: ReactNode
  containerClassName?: string
  /** Hide the label visually (still announced). */
  srLabel?: boolean
}

function useFieldIds(id?: string) {
  const auto = useId()
  const fieldId = id ?? `f-${auto}`
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` }
}

export function FieldLabel({
  htmlFor,
  label,
  required,
  optional,
  srOnly,
  as = 'label',
  id,
}: {
  htmlFor?: string
  label: ReactNode
  required?: boolean
  optional?: boolean
  srOnly?: boolean
  as?: 'label' | 'span'
  id?: string
}) {
  const cls = cn('mb-1.5 block text-[13px] font-bold text-night-900', srOnly && 'sr-only')
  const content = (
    <>
      {label}
      {required && (
        <span className="text-night-900" aria-hidden="true">
          {' '}*
        </span>
      )}
      {optional && <span className="font-medium text-night-500"> (facultatif)</span>}
    </>
  )
  return as === 'span' ? (
    <span id={id} className={cls}>
      {content}
    </span>
  ) : (
    <label id={id} htmlFor={htmlFor} className={cls}>
      {content}
    </label>
  )
}

function Messages({ hint, error, hintId, errorId }: { hint?: ReactNode; error?: string; hintId: string; errorId: string }) {
  return (
    <>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-night-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-semibold text-alert-600">
          {error}
        </p>
      )}
    </>
  )
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> &
  Common & {
    /** Unit displayed in a separate box on the right (e.g. "cm"). */
    suffix?: string
  }

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, optional, hint, error, icon, suffix, containerClassName, srLabel, required, className, type = 'text', ...props },
  ref,
) {
  const { fieldId, hintId, errorId } = useFieldIds(id)
  const suffixId = `${fieldId}-unit`
  const describedBy =
    [hint && !error ? hintId : null, error ? errorId : null, suffix ? suffixId : null].filter(Boolean).join(' ') || undefined
  const isDate = type === 'date'

  return (
    <div className={cn('w-full', containerClassName)}>
      <FieldLabel htmlFor={fieldId} label={label} required={required} optional={optional} srOnly={srLabel} />
      <div className={cn('relative', suffix && 'flex items-stretch')}>
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-night-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            fieldControl,
            'h-12 px-4',
            icon && 'pl-11',
            isDate &&
              'pr-11 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-11 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
            suffix && 'rounded-r-none',
            className,
          )}
          {...props}
        />
        {isDate && (
          <Calendar className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" aria-hidden="true" />
        )}
        {suffix && (
          <span
            id={suffixId}
            className="flex min-w-[52px] items-center justify-center rounded-r-xl border border-l-0 border-night-100 bg-night-50/60 px-3 text-sm font-semibold text-night-600"
          >
            {suffix}
          </span>
        )}
      </div>
      <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  )
})

export type FieldOption = string | { value: string; label: string }

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> &
  Common & {
    options: FieldOption[]
    placeholder?: string
  }

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id, label, optional, hint, error, icon, containerClassName, srLabel, required, options, placeholder, className, value, ...props },
  ref,
) {
  const { fieldId, hintId, errorId } = useFieldIds(id)
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const empty = value === '' || value === undefined

  return (
    <div className={cn('w-full', containerClassName)}>
      <FieldLabel htmlFor={fieldId} label={label} required={required} optional={optional} srOnly={srLabel} />
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-night-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <select
          ref={ref}
          id={fieldId}
          required={required}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldControl, 'h-12 appearance-none px-4 pr-11', icon && 'pl-11', empty && 'text-night-500', className)}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o
            return (
              <option key={opt.value} value={opt.value} className="text-night-900">
                {opt.label}
              </option>
            )
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" aria-hidden="true" />
      </div>
      <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  )
})

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Omit<Common, 'icon'> & {
    value: string
    maxLength?: number
  }

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { id, label, optional, hint, error, containerClassName, srLabel, required, maxLength, className, value, rows = 5, ...props },
  ref,
) {
  const { fieldId, hintId, errorId } = useFieldIds(id)
  const counterId = `${fieldId}-count`
  const describedBy =
    [hint && !error ? hintId : null, error ? errorId : null, maxLength ? counterId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('w-full', containerClassName)}>
      <FieldLabel htmlFor={fieldId} label={label} required={required} optional={optional} srOnly={srLabel} />
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldControl, 'block min-h-[120px] resize-none px-4 py-3 leading-relaxed', className)}
        {...props}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Messages hint={hint} error={error} hintId={hintId} errorId={errorId} />
        </div>
        {maxLength && (
          <p id={counterId} className="mt-1.5 shrink-0 text-xs tabular-nums text-night-500">
            {value.length} / {maxLength}
            <span className="sr-only"> caractères</span>
          </p>
        )}
      </div>
    </div>
  )
})
