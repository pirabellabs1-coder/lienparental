'use client'

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { applyBackspace, applyInput, fillFrom, focusTarget, onlyDigits, toDigits, type OtpStep } from './otp-logic'

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
  const digits = toDigits(value, length)
  // Latest value, updated synchronously on every change: the focus handlers of
  // the next box run before React re-renders, so they must not read `digits`
  // from a stale render (that bug sent the focus back and gave "246" for 123456).
  const valueRef = useRef(value)
  valueRef.current = value

  const current = () => toDigits(valueRef.current, length)

  const apply = ({ digits: next, focus }: OtpStep, complete = true) => {
    const joined = next.join('')
    valueRef.current = joined
    onChange(joined)
    if (complete && joined.length === length && !next.includes('')) onComplete?.(joined)
    const el = refs.current[focus]
    if (el && document.activeElement !== el) el.focus()
    else el?.select()
  }

  const onKeyDown = (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      apply(applyBackspace(current(), idx), false)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      const next = current()
      next[idx] = ''
      apply({ digits: next, focus: idx }, false)
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault()
      refs.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault()
      refs.current[idx + 1]?.focus()
    }
  }

  const onPaste = (idx: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = onlyDigits(e.clipboardData.getData('text'))
    if (!pasted) return
    e.preventDefault()
    // A full code always lands from the first box; a partial one from the current box.
    apply(fillFrom(current(), pasted.length >= length ? 0 : focusTarget(current(), idx), pasted))
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
          onChange={(e) => apply(applyInput(current(), i, e.target.value))}
          onKeyDown={onKeyDown(i)}
          onPaste={onPaste(i)}
          onFocus={(e) => {
            // Keep digits contiguous: a click on a later box jumps back to the first empty one.
            const target = focusTarget(current(), i)
            if (target !== i) {
              refs.current[target]?.focus()
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
