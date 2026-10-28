'use client'

import { useId, useRef, type ClipboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { FieldLabel, fieldControl } from './fields'
import { EMAIL_OTP_MAX, EMAIL_OTP_MIN, isBulkInsert, normalizeEmailOtp, shouldAutoVerify } from '@/lib/auth/email-otp'

type Props = {
  label: string
  value: string
  onChange: (v: string) => void
  /** Code complet arrivé d'un coup (collage / saisie automatique) et de la longueur attendue. */
  onComplete?: (v: string) => void
  /** Longueur attendue si elle est connue (sinon : pas de validation automatique). */
  expectedLength?: number | null
  disabled?: boolean
  error?: boolean
  autoFocus?: boolean
  describedBy?: string
  placeholder?: string
}

/**
 * Champ unique du code d'inscription reçu par e-mail : 6 à 10 chiffres selon le réglage
 * Supabase « Email OTP Length » (lib/auth/email-otp.ts). Remplace les 6 cases d'OTPInput,
 * qui ne pouvaient pas recevoir un code de 7 chiffres. OTPInput reste utilisé pour la 2FA TOTP.
 * - chiffres uniquement : espaces, tirets… ignorés à la frappe comme au collage ;
 * - autocomplete="one-time-code" (suggestion du code par iOS / Android) ;
 * - grands caractères espacés, 56 px de haut.
 */
export function EmailCodeInput({
  label,
  value,
  onChange,
  onComplete,
  expectedLength = null,
  disabled,
  error,
  autoFocus,
  describedBy,
  placeholder,
}: Props) {
  const id = `email-code-${useId()}`
  // Valeur la plus récente (deux événements peuvent précéder le rendu suivant).
  const valueRef = useRef(value)
  valueRef.current = value

  const commit = (next: string, bulk: boolean) => {
    valueRef.current = next
    onChange(next)
    if (shouldAutoVerify(next, expectedLength, bulk)) onComplete?.(next)
  }

  // Le collage remplace le champ : on normalise nous-mêmes, sinon maxLength tronquerait
  // « 123 456 7 » ou « 1234-5678 » AVANT le retrait des séparateurs.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = normalizeEmailOtp(e.clipboardData.getData('text'))
    e.preventDefault()
    if (!pasted) return
    commit(pasted, true)
  }

  return (
    <div className="w-full">
      <FieldLabel htmlFor={id} label={label} />
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${EMAIL_OTP_MIN},${EMAIL_OTP_MAX}}`}
        minLength={EMAIL_OTP_MIN}
        maxLength={EMAIL_OTP_MAX}
        enterKeyHint="done"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          const next = normalizeEmailOtp(e.target.value)
          commit(next, isBulkInsert(valueRef.current, next))
        }}
        onPaste={onPaste}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          fieldControl,
          'h-14 px-4 text-center font-mono text-[26px] font-bold tabular-nums tracking-[0.35em] placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal',
        )}
      />
    </div>
  )
}
