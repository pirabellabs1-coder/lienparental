'use client'

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

type Props = {
  length?: number
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  error?: boolean
  autoFocus?: boolean
  ariaLabel?: string
  describedBy?: string
}

/**
 * One-box-per-digit code entry (mockup step 7: six light boxes).
 * - Digits only, paste supported, arrows/Backspace handled.
 * - Every box exposes autocomplete="one-time-code" so iOS/Android SMS/e-mail
 *   autofill can land on whichever box is focused.
 * - Boxes are 48px high (≥ 44px touch target).
 */
export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
  ariaLabel: ariaLabelProp,
  describedBy,
}: Props) {
  const t = useTranslations('public.onboarding.otp')
  const ariaLabel = ariaLabelProp ?? t('label')
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const commit = (next: string[]) => {
    const joined = next.join('')
    onChange(joined)
    if (joined.length === length && !next.includes('')) onComplete?.(joined)
  }

  const setDigit = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, '')
    if (clean.length > 1) {
      // Autofill / fast typing delivered several digits into one box.
      fill(clean, idx)
      return
    }
    const next = [...digits]
    next[idx] = clean
    commit(next)
    if (clean && idx < length - 1) refs.current[idx + 1]?.focus()
  }

  const fill = (raw: string, start = 0) => {
    const chars = raw.slice(0, length - start).split('')
    const next = [...digits]
    chars.forEach((c, i) => (next[start + i] = c))
    commit(next)
    refs.current[Math.min(start + chars.length, length - 1)]?.focus()
  }

  const onKeyDown = (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...digits]
      if (next[idx]) {
        next[idx] = ''
        onChange(next.join(''))
      } else if (idx > 0) {
        next[idx - 1] = ''
        onChange(next.join(''))
        refs.current[idx - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault()
      refs.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault()
      refs.current[idx + 1]?.focus()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    e.preventDefault()
    fill(pasted, 0)
  }

  return (
    <div className="flex items-center gap-2.5" role="group" aria-label={ariaLabel} aria-describedby={describedBy}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={onKeyDown(i)}
          onPaste={onPaste}
          onFocus={(e) => {
            // Keep digits contiguous: jump back to the first empty box.
            const firstEmpty = digits.findIndex((x) => !x)
            if (firstEmpty !== -1 && i > firstEmpty) {
              refs.current[firstEmpty]?.focus()
              return
            }
            e.currentTarget.select()
          }}
          aria-label={t('digit', { n: i + 1, total: length })}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-12 w-full min-w-0 max-w-[48px] rounded-xl border bg-white text-center text-xl font-bold text-night-900 outline-none transition-colors',
            'focus:border-leaf-500 focus:ring-4 focus:ring-leaf-100',
            error ? 'border-alert-400' : d ? 'border-night-300' : 'border-night-100',
            disabled && 'opacity-50',
          )}
        />
      ))}
    </div>
  )
}
