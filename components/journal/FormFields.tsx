'use client'

import {
  useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { useTranslations } from 'next-intl'
import { Calendar, Check, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'

// Primitives de formulaire « Ajouter un événement » (maquettes Journal + Calendrier).
// Partagées par components/journal et components/calendrier.

const fieldBase =
  'block w-full rounded-xl border bg-white px-4 text-[13px] text-night-900 placeholder:text-night-400 ' +
  'transition-colors focus:outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20'

export function FieldLabel({ htmlFor, children, as = 'label', id }: {
  htmlFor?: string; children: ReactNode; as?: 'label' | 'legend' | 'p'; id?: string
}) {
  const cls = 'mb-2 block text-[13px] font-bold text-night-900'
  if (as === 'legend') return <legend id={id} className={cls}>{children}</legend>
  if (as === 'p') return <p id={id} className={cls}>{children}</p>
  return <label id={id} htmlFor={htmlFor} className={cls}>{children}</label>
}

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-alert-600">{children}</p>
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string
  trailingIcon?: ReactNode
  error?: string
  /** Aide sous le champ (reliée par aria-describedby) */
  hint?: string
}

export function TextField({ label, trailingIcon, error, hint, id, className, ...props }: TextFieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const errId = `${inputId}-err`
  const hintId = `${inputId}-hint`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldBase, 'h-12', trailingIcon && 'pr-11', error ? 'border-alert-400' : 'border-night-100', className)}
          {...props}
        />
        {trailingIcon && (
          <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-night-700">
            {trailingIcon}
          </span>
        )}
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-night-600">{hint}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  label: string
  options: { value: string; label: string }[]
  /** Option vide initiale (« Choisir… ») */
  placeholder?: string
  error?: string
  /** Aide sous le champ (reliée par aria-describedby) */
  hint?: string
}

/** Liste déroulante native (clavier et lecteurs d'écran gérés par la plateforme). */
export function SelectField({ label, options, placeholder, error, hint, id, className, ...props }: SelectFieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const errId = `${inputId}-err`
  const hintId = `${inputId}-hint`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldBase, 'h-12 appearance-none pr-11', error ? 'border-alert-400' : 'border-night-100', className)}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-night-600">{hint}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

/** Choix unique en pastilles (radios natifs : flèches clavier incluses). */
export function ChoiceChips({
  name, legend, options, value, onChange, error, columns = 3, hint,
}: {
  name: string; legend: string; options: { value: string; label: string }[]
  value: string; onChange: (v: string) => void; error?: string
  /** 4 : 2 colonnes sur mobile, 4 à partir de `sm` */
  columns?: 2 | 3 | 4
  /** Aide sous les choix (reliée par aria-describedby) */
  hint?: string
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <fieldset aria-describedby={describedBy}>
      <FieldLabel as="legend">{legend}</FieldLabel>
      <div className={cn('grid gap-2', columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : columns === 3 ? 'grid-cols-2 min-[380px]:grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label key={o.value} className="relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                aria-invalid={error ? true : undefined}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 text-center text-[12.5px] font-semibold transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-2',
                  checked ? 'border-leaf-500 bg-leaf-50 text-leaf-700 ring-1 ring-leaf-500' : error ? 'border-alert-400 bg-white text-night-900' : 'border-night-100 bg-white text-night-900 hover:border-night-200',
                )}
              >
                {checked && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                {o.label}
              </span>
            </label>
          )
        })}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-night-600">{hint}</p>}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </fieldset>
  )
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }

export function TextAreaField({ label, error, id, className, ...props }: TextAreaFieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const errId = `${inputId}-err`
  return (
    <div>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <textarea
        id={inputId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={cn(fieldBase, 'min-h-[88px] resize-y py-3.5 leading-relaxed', error ? 'border-alert-400' : 'border-night-100', className)}
        {...props}
      />
      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

// Champ date / heure natif avec l'icône de la maquette à droite.
// L'indicateur natif (Chromium) est rendu invisible mais reste cliquable sous notre icône.
const pickerIndicator =
  '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 ' +
  '[&::-webkit-calendar-picker-indicator]:h-6 [&::-webkit-calendar-picker-indicator]:w-6 ' +
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0'

export function DateTimeFields({
  date, time, onDate, onTime, dateError, max, legend, withTime = true,
}: {
  date: string; time: string
  onDate: (v: string) => void; onTime: (v: string) => void
  dateError?: string; max?: string; legend?: string
  /** false : date seule (ex. dépense) */
  withTime?: boolean
}) {
  const t = useTranslations('family.journal.fields')
  const id = useId()
  return (
    <fieldset>
      <FieldLabel as="legend">{legend ?? t('dateTime')}</FieldLabel>
      <div className={cn('grid gap-3', withTime ? 'grid-cols-[1.25fr_1fr]' : 'grid-cols-1 sm:max-w-xs')}>
        <div className="relative">
          <label htmlFor={`${id}-d`} className="sr-only">{t('date')}</label>
          <input
            id={`${id}-d`}
            type="date"
            required
            value={date}
            max={max}
            onChange={(e) => onDate(e.target.value)}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? `${id}-derr` : undefined}
            className={cn(fieldBase, 'relative h-12 pr-11', pickerIndicator, dateError ? 'border-alert-400' : 'border-night-100')}
          />
          <Calendar aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
        </div>
        {withTime && <div className="relative">
          <label htmlFor={`${id}-t`} className="sr-only">{t('time')}</label>
          <input
            id={`${id}-t`}
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            className={cn(fieldBase, 'relative h-12 border-night-100 pr-11', pickerIndicator)}
          />
          <Clock aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
        </div>}
      </div>
      <FieldError id={`${id}-derr`}>{dateError}</FieldError>
    </fieldset>
  )
}

// Ligne « Sélectionner un ou plusieurs enfants › » qui déplie une liste de cases à cocher.
export function ChildrenPicker({
  options, value, onChange, label,
}: {
  options: { id: string; label: string; hint?: string }[]
  value: string[]
  onChange: (ids: string[]) => void
  label?: string
}) {
  const t = useTranslations('family.journal.fields')
  const [open, setOpen] = useState(false)
  const id = useId()
  const selected = options.filter((o) => value.includes(o.id)).map((o) => o.label)
  const toggle = (cid: string) =>
    onChange(value.includes(cid) ? value.filter((x) => x !== cid) : [...value, cid])

  return (
    <div>
      <FieldLabel as="p" id={`${id}-l`}>{label ?? t('children')}</FieldLabel>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-labelledby={`${id}-l ${id}-v`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 text-left text-[13px] transition-colors',
          open ? 'border-leaf-500' : 'border-night-100 hover:border-night-200',
        )}
      >
        <span id={`${id}-v`} className={cn('truncate', selected.length ? 'font-medium text-night-900' : 'text-night-500')}>
          {selected.length ? selected.join(', ') : t('childrenPlaceholder')}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn('h-[18px] w-[18px] shrink-0 text-night-700 motion-safe:transition-transform', open && 'rotate-90')}
        />
      </button>
      <div id={`${id}-panel`} hidden={!open} className="mt-2 rounded-xl border border-night-100 bg-white px-2">
        <ul role="group" aria-labelledby={`${id}-l`} className="divide-y divide-night-50">
          {options.map((o) => {
            const checked = value.includes(o.id)
            return (
              <li key={o.id}>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg px-2">
                  <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(o.id)} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-5 w-5 place-items-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500/40',
                      checked ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-200 bg-white',
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-night-900">{o.label}</span>
                  {o.hint && <span className="text-xs text-night-500">{o.hint}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export type TypeTileOption = {
  value: string
  label: string
  icon: ReactNode
  /** Classes de la tuile au repos (fond/bordure teintés) */
  idleClass?: string
  /** Classes de la tuile sélectionnée */
  selectedClass?: string
}

/** Grille de tuiles « Type d'événement » — radios natifs (flèches clavier incluses). */
export function TypeTileGroup({
  name, legend, options, value, onChange, columns = 4,
}: {
  name: string; legend?: string; options: TypeTileOption[]; value: string; onChange: (v: string) => void
  /** 4 par défaut ; 3 pour 6 tuiles (Journal) */
  columns?: 3 | 4
}) {
  const t = useTranslations('family.journal.fields')
  return (
    <fieldset>
      <FieldLabel as="legend">{legend ?? t('eventType')}</FieldLabel>
      <div className={cn('grid gap-2.5', columns === 3 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-4')}>
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label key={o.value} className="relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex aspect-[1/1.02] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-2',
                  checked
                    ? (o.selectedClass ?? 'border-leaf-500 bg-leaf-50/60 text-leaf-700 ring-1 ring-leaf-500')
                    : (o.idleClass ?? 'border-night-100 bg-white text-night-900 hover:border-night-200'),
                )}
              >
                <span aria-hidden="true">{o.icon}</span>
                <span className="text-[10.5px] font-semibold leading-tight text-night-900">{o.label}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Bouton principal vert pleine largeur (« Enregistrer », « Valider (2) »). */
export function SubmitBar({ children, disabled, type = 'submit', onClick }: {
  children: ReactNode; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-leaf-500 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] transition-colors hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-[.98]"
    >
      {children}
    </button>
  )
}
