'use client'
// Champs "boîte" des maquettes : libellé gris en petit à l'intérieur du cadre,
// valeur en dessous. Restent de vrais <input>/<select> avec <label> associé.
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

const boxCls =
  'flex min-h-[62px] items-center gap-3 rounded-xl2 border border-night-100 bg-white px-4 py-2 shadow-soft transition-colors ' +
  'focus-within:border-leaf-500 focus-within:ring-2 focus-within:ring-leaf-100'

type BoxInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  leading?: ReactNode
  trailing?: ReactNode
  error?: string
  containerClassName?: string
}

export const BoxInput = forwardRef<HTMLInputElement, BoxInputProps>(function BoxInput(
  { label, leading, trailing, error, id, className, containerClassName, ...props },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const errId = `${inputId}-err`
  return (
    <div className={containerClassName}>
      <div className={cn(boxCls, error && 'border-alert-400')}>
        {leading && <span aria-hidden className="shrink-0 text-night-900">{leading}</span>}
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="block text-[11.5px] text-night-700">{label}</label>
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            className={cn('mt-0.5 w-full bg-transparent text-[15px] text-night-900 placeholder:text-night-400 focus:outline-none', className)}
            {...props}
          />
        </div>
        {trailing && <span className="shrink-0 text-night-700">{trailing}</span>}
      </div>
      {error && <p id={errId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{error}</p>}
    </div>
  )
})

type Option = { value: string; label: string }

type BoxSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string
  options: Option[]
  leading?: ReactNode
  containerClassName?: string
}

export function BoxSelect({ label, options, leading, id, className, containerClassName, ...props }: BoxSelectProps) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div className={cn(boxCls, 'relative', containerClassName)}>
      {leading && <span aria-hidden className="shrink-0">{leading}</span>}
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-[11.5px] text-night-700">{label}</label>
        <select
          id={inputId}
          className={cn('mt-0.5 w-full appearance-none bg-transparent pr-7 text-[15px] text-night-900 focus:outline-none', className)}
          {...props}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-900" />
    </div>
  )
}

/** Libellé gras au-dessus + select encadré (Préférences > Général). */
export function LabeledSelect({ label, options, id, className, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { label: string; options: Option[] }) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div>
      <label htmlFor={inputId} className="mb-2.5 block text-[14px] font-bold text-night-900">{label}</label>
      <div className="relative">
        <select
          id={inputId}
          className={cn(
            'min-h-[50px] w-full appearance-none rounded-xl2 border border-night-100 bg-white pl-4 pr-11 text-[14.5px] font-bold text-night-900 shadow-soft',
            'focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100',
            className,
          )}
          {...props}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-900" />
      </div>
    </div>
  )
}

/** Mot de passe : libellé gras au-dessus, bouton œil pour afficher/masquer. */
export function PasswordField({
  label,
  id,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; error?: string }) {
  const auto = useId()
  const inputId = id ?? auto
  const errId = `${inputId}-err`
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-[14px] font-bold text-night-900">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={cn(
            'min-h-[50px] w-full rounded-xl2 border border-night-100 bg-white pl-4 pr-14 text-[15px] tracking-wide text-night-900 shadow-soft',
            'focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100',
            error && 'border-alert-400',
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {error && <p id={errId} role="alert" className="mt-1.5 text-xs font-medium text-alert-500">{error}</p>}
    </div>
  )
}

/** Champ texte libellé gras au-dessus (formulaires d'aide). */
export const LabeledInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function LabeledInput(
  { label, id, className, ...props },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-[13px] font-bold text-night-900">{label}</label>
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'min-h-[46px] w-full rounded-xl2 border border-night-100 bg-white px-4 text-[14px] text-night-900 placeholder:text-night-400 shadow-soft',
          'focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100',
          className,
        )}
        {...props}
      />
    </div>
  )
})
