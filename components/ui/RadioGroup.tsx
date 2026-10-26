'use client'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type RadioOption = {
  value: string
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

type Props = {
  name?: string
  label?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  columns?: 1 | 2 | 3
  error?: string
  hint?: string
  required?: boolean
  className?: string
}

export function RadioGroup({ name, label, value, defaultValue, onChange, options, columns = 1, error, hint, required, className }: Props) {
  const autoName = useId()
  const groupName = name ?? autoName
  const groupId = `${groupName}-group`
  const hintId = `${groupName}-hint`
  const errorId = `${groupName}-error`

  return (
    <div className={cn('w-full', className)} role="radiogroup" aria-labelledby={label ? groupId : undefined} aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}>
      {label && (
        <div id={groupId} className="block text-sm font-medium text-night-900 dark:text-night-50 mb-2">
          {label}
          {required && <span className="text-alert-500 ml-0.5" aria-hidden="true">*</span>}
        </div>
      )}
      <div className={cn('grid gap-2', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3')}>
        {options.map(opt => {
          const id = `${groupName}-${opt.value}`
          const controlled = value !== undefined
          const checked = controlled ? value === opt.value : undefined
          return (
            <label
              key={opt.value}
              htmlFor={id}
              className={cn(
                'relative flex items-start gap-3 min-h-[56px] rounded-xl2 border p-4 cursor-pointer transition-colors',
                'bg-white dark:bg-night-900 border-night-200 dark:border-night-700',
                'hover:border-night-300 dark:hover:border-night-600',
                'has-[:checked]:border-leaf-500 has-[:checked]:bg-leaf-50 dark:has-[:checked]:bg-leaf-900/20',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                '[&:has(:checked)_.lp-radio-ring]:border-leaf-500 [&:has(:checked)_.lp-radio-dot]:opacity-100 [&:has(:checked)_.lp-radio-dot]:scale-100',
                opt.disabled && 'opacity-50 cursor-not-allowed',
                error && 'border-alert-300'
              )}
            >
              <input
                type="radio"
                id={id}
                name={groupName}
                value={opt.value}
                defaultChecked={!controlled ? defaultValue === opt.value : undefined}
                checked={checked}
                onChange={() => onChange?.(opt.value)}
                disabled={opt.disabled}
                className="peer sr-only"
              />
              <span className="lp-radio-ring mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-night-300 dark:border-night-600 transition-colors">
                <span className="lp-radio-dot h-2.5 w-2.5 rounded-full bg-leaf-500 opacity-0 scale-0 transition-transform" aria-hidden="true" />
              </span>
              {opt.icon && <span className="text-night-700 dark:text-night-200">{opt.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-night-900 dark:text-night-50">{opt.label}</span>
                {opt.description && <span className="block mt-0.5 text-xs text-night-500 dark:text-night-300">{opt.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-night-500 dark:text-night-300">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{error}</p>}
    </div>
  )
}
