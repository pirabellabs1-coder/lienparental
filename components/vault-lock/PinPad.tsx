'use client'
/**
 * Saisie du code à 6 chiffres.
 * - Un vrai <input> (type password, inputmode numeric) porte la valeur : saisie au
 *   clavier physique, collage, lecteurs d'écran. Il est visuellement masqué, les
 *   6 pastilles en reflètent l'état et l'anneau de focus suit le champ.
 * - Pavé tactile : boutons hors ordre de tabulation (le champ suffit au clavier) mais
 *   présents dans l'arbre d'accessibilité (balayage VoiceOver / TalkBack).
 * - Validation automatique au 6e chiffre.
 */
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { Delete } from 'lucide-react'
import { PIN_LENGTH } from '@/lib/vault-lock/config'
import { cn } from '@/lib/cn'

export type PinPadHandle = { clear: () => void; focus: () => void }

type Props = {
  label: string
  onComplete: (pin: string) => void
  disabled?: boolean
  error?: boolean
  describedBy?: string
  /** Contenu de la case en bas à gauche du pavé (ex. bouton empreinte). */
  extraKey?: ReactNode
  autoFocus?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export const PinPad = forwardRef<PinPadHandle, Props>(function PinPad(
  { label, onComplete, disabled, error, describedBy, extraKey, autoFocus = true },
  ref,
) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [shake, setShake] = useState(0)

  useImperativeHandle(ref, () => ({
    clear: () => setValue(''),
    focus: () => inputRef.current?.focus({ preventScroll: true }),
  }), [])

  // Ordinateur : focus direct pour taper le code. Mobile : pas de clavier système par-dessus le pavé.
  useEffect(() => {
    if (!autoFocus || disabled) return
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus, disabled])

  useEffect(() => {
    if (error) setShake((s) => s + 1)
  }, [error])

  const update = useCallback((next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setValue(clean)
    if (clean.length === PIN_LENGTH) onComplete(clean)
  }, [onComplete])

  const press = (d: string) => {
    if (disabled || value.length >= PIN_LENGTH) return
    update(value + d)
  }
  const backspace = () => {
    if (disabled) return
    setValue((v) => v.slice(0, -1))
  }

  // Clic souris sur le pavé : le focus reste dans le champ (saisie clavier possible ensuite).
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  const keyCls =
    'inline-flex h-[60px] w-[60px] select-none items-center justify-center rounded-full text-[24px] font-semibold text-night-900 ' +
    'bg-night-50/70 transition-[background-color,transform] duration-150 hover:bg-night-100 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-40 sm:h-16 sm:w-16'

  return (
    <div className="flex w-full flex-col items-center">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'relative flex cursor-text items-center justify-center rounded-2xl px-5 py-4 transition-shadow',
          focused && 'ring-2 ring-leaf-500 ring-offset-2',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={PIN_LENGTH}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          enterKeyHint="done"
          disabled={disabled}
          value={value}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => update(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-text rounded-2xl bg-transparent text-transparent caret-transparent opacity-0"
        />
        <span key={shake} className={cn('flex gap-3.5', error && shake > 0 && 'motion-safe:animate-[vaultShake_.4s_ease-in-out]')}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'h-4 w-4 rounded-full border-2 transition-[background-color,border-color,transform] duration-150 motion-reduce:transition-none',
              i < value.length
                ? error ? 'scale-110 border-alert-500 bg-alert-500' : 'scale-110 border-leaf-500 bg-leaf-500'
                : error ? 'border-alert-300 bg-white' : 'border-night-300 bg-white',
            )}
          />
        ))}
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {value.length > 0 ? `${value.length} chiffre${value.length > 1 ? 's' : ''} sur ${PIN_LENGTH}` : ''}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3" role="group" aria-label="Pavé numérique">
        {KEYS.map((k) => (
          <button key={k} type="button" tabIndex={-1} onMouseDown={keepFocus} disabled={disabled} onClick={() => press(k)} className={keyCls} aria-label={k}>
            {k}
          </button>
        ))}
        <div className="flex h-[60px] w-[60px] items-center justify-center sm:h-16 sm:w-16">{extraKey}</div>
        <button type="button" tabIndex={-1} onMouseDown={keepFocus} disabled={disabled} onClick={() => press('0')} className={keyCls} aria-label="0">0</button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={keepFocus}
          disabled={disabled || value.length === 0}
          onClick={backspace}
          aria-label="Effacer le dernier chiffre"
          className={cn(keyCls, 'bg-transparent text-night-700 hover:bg-night-50')}
        >
          <Delete className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <style>{`@keyframes vaultShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
    </div>
  )
})
