'use client'
import { forwardRef, useId, useRef, useState, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  onClear?: () => void
  containerClassName?: string
}

export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
  { id, label, className, containerClassName, value, defaultValue, onChange, onClear, placeholder = 'Rechercher…', ...props }, ref
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [internal, setInternal] = useState<string>(() => (defaultValue ?? value ?? '').toString())
  const current = value !== undefined ? value.toString() : internal
  const localRef = useRef<HTMLInputElement>(null)

  const setRefs = (el: HTMLInputElement | null) => {
    localRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
  }

  const clear = () => {
    if (value === undefined) setInternal('')
    onClear?.()
    const el = localRef.current
    if (el) {
      const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      native?.call(el, '')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
    }
  }

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="sr-only">{label}</label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-night-400" aria-hidden="true" />
        <input
          ref={setRefs}
          id={inputId}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={(e) => { if (value === undefined) setInternal(e.target.value); onChange?.(e) }}
          className={cn(
            'w-full min-h-[48px] rounded-xl bg-white dark:bg-night-900 border border-night-200 dark:border-night-700',
            'pl-11 pr-11 py-3 text-base text-night-900 dark:text-night-50 placeholder:text-night-400',
            'shadow-soft transition-colors',
            'focus-visible:border-leaf-500 focus-visible:outline-none',
            '[&::-webkit-search-cancel-button]:appearance-none',
            className
          )}
          {...props}
        />
        {current.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label="Effacer la recherche"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full text-night-500 hover:text-night-900 hover:bg-night-50 dark:hover:bg-night-800 focus-visible:outline-none"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
})
