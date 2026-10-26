'use client'

import { forwardRef, useId, useMemo, useState, type InputHTMLAttributes } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { FieldLabel, fieldControl } from './fields'

type Rule = { label: string; test: (v: string) => boolean }

export const PASSWORD_RULES: Rule[] = [
  { label: '8 caractères minimum', test: (v) => v.length >= 8 },
  { label: '1 lettre majuscule', test: (v) => /[A-Z]/.test(v) },
  { label: '1 chiffre ou un symbole', test: (v) => /[0-9]/.test(v) || /[^A-Za-z0-9]/.test(v) },
]

export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length
  return passed as 0 | 1 | 2 | 3
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  showRules?: boolean
  showStrength?: boolean
  value: string
  onValueChange: (v: string) => void
  errorText?: string
}

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  {
    label = 'Mot de passe',
    showRules = false,
    showStrength = false,
    value,
    onValueChange,
    errorText,
    className,
    id: idProp,
    autoComplete,
    ...rest
  },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const reactId = useId()
  const id = idProp || `pwd-${reactId}`
  const helpId = `${id}-help`
  const errId = `${id}-err`

  const score = useMemo(() => passwordStrength(value), [value])
  const strengthLabel = score === 0 ? '' : score === 1 ? 'Faible' : score === 2 ? 'Moyen' : 'Fort'
  const strengthColor = score === 1 ? 'bg-alert-500' : score === 2 ? 'bg-gold-300' : 'bg-leaf-500'

  return (
    <div className={cn('w-full', className)}>
      <FieldLabel htmlFor={id} label={label} />

      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={cn(showRules && helpId, errorText && errId) || undefined}
          autoComplete={autoComplete ?? 'new-password'}
          autoCapitalize="none"
          spellCheck={false}
          className={cn(fieldControl, 'h-12 px-4 pr-12 tracking-wide')}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label="Afficher le mot de passe"
          aria-pressed={visible}
          aria-controls={id}
          className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-night-500 transition-colors hover:text-night-900"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="mt-2 flex items-center gap-3" aria-live="polite">
          <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn('h-full flex-1 rounded-full', n <= score ? strengthColor : 'bg-night-100')} />
            ))}
          </div>
          <span className="w-14 text-right text-xs font-semibold text-night-600">{strengthLabel}</span>
        </div>
      )}

      {showRules && (
        <ul id={helpId} className="mt-3 space-y-2 text-[13px]">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value)
            return (
              <li key={r.label} className={cn('flex items-center gap-2.5', ok ? 'text-night-900' : 'text-night-500')}>
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full transition-colors motion-reduce:transition-none',
                    ok ? 'bg-leaf-500 text-white' : 'border-[1.5px] border-night-200 text-transparent',
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={3.2} />
                </span>
                <span>
                  {r.label}
                  <span className="sr-only">{ok ? ' : respecté' : ' : non respecté'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {errorText && (
        <p id={errId} role="alert" className="mt-1.5 text-xs font-semibold text-alert-600">
          {errorText}
        </p>
      )}
    </div>
  )
})
