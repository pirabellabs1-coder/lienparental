'use client'
/**
 * Primitives de formulaire des éditeurs de contenus.
 * Les erreurs de validation (zod côté serveur, chemins « etapes.2.titre ») sont fournies par
 * IssuesProvider et rattachées au bon champ (aria-invalid + aria-describedby + message).
 */
import { createContext, useContext, useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { isInvariantPath } from '@/lib/contenus/i18n'
import type { Issue } from './client-api'

const IssuesCtx = createContext<Issue[]>([])
export const IssuesProvider = IssuesCtx.Provider

/**
 * Mode traduction (EditorShell, langue ≠ français) : les champs invariants (slugs, URL, catégories,
 * dates… : lib/contenus/i18n-invariants.ts) sont verrouillés et la structure des listes est figée
 * (mêmes éléments que le français). Le serveur force de toute façon ces valeurs depuis le français.
 */
const TranslatingCtx = createContext(false)
export const TranslatingProvider = TranslatingCtx.Provider
export function useTranslating(): boolean {
  return useContext(TranslatingCtx)
}

function useLocked(path?: string): boolean {
  const translating = useContext(TranslatingCtx)
  return translating && (isInvariantPath(path) || path === 'publishedAt')
}

export function useIssue(path?: string): string | undefined {
  const issues = useContext(IssuesCtx)
  if (!path) return undefined
  return issues.find((i) => i.path === path)?.message
}

/** Vrai si une erreur concerne ce chemin ou un de ses descendants (pour signaler une section). */
export function useHasIssueUnder(prefix: string): boolean {
  const issues = useContext(IssuesCtx)
  return issues.some((i) => i.path === prefix || i.path.startsWith(`${prefix}.`))
}

export const inputCls =
  'w-full min-h-[44px] rounded-xl border border-night-200 bg-white px-3.5 py-2.5 text-[15px] text-night-900 shadow-soft placeholder:text-night-400 transition-colors focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500/30 aria-[invalid=true]:border-alert-400 disabled:bg-night-50 disabled:text-night-500'

export const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-[14px] font-semibold text-night-900 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-leaf-500 px-4 text-[14px] font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export const btnDanger =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-alert-200 bg-white px-4 text-[14px] font-semibold text-alert-600 hover:bg-alert-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-400 disabled:cursor-not-allowed disabled:opacity-50'
export const iconBtn =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-night-600 hover:bg-night-50 hover:text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:opacity-30 disabled:hover:bg-transparent'

type FieldRender = (p: { id: string; describedBy?: string; invalid: boolean; disabled?: boolean }) => ReactNode

export function Field({ label, path, hint, required, children, className, counter }: {
  label: ReactNode; path?: string; hint?: ReactNode; required?: boolean; children: FieldRender; className?: string; counter?: ReactNode
}) {
  const id = useId()
  const error = useIssue(path)
  const locked = useLocked(path)
  const shownHint = locked ? 'Commun à toutes les langues : se modifie dans la version française.' : hint
  const describedBy = [shownHint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('min-w-0', className)} data-field-path={path}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13.5px] font-semibold text-night-900">
          {label}
          {required && <span aria-hidden="true" className="ml-0.5 text-alert-500">*</span>}
        </label>
        {counter}
      </div>
      {children({ id, describedBy, invalid: Boolean(error), disabled: locked || undefined })}
      {shownHint && !error && <p id={`${id}-hint`} className="mt-1 text-[12.5px] text-night-600">{shownHint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-[12.5px] font-semibold text-alert-600">{error}</p>}
    </div>
  )
}

function Counter({ value, max }: { value: string; max?: number }) {
  if (!max) return null
  const n = value.length
  return <span className={cn('text-[11.5px] tabular-nums', n > max ? 'font-bold text-alert-600' : n > max * 0.9 ? 'text-gold-700' : 'text-night-500')}>{n}/{max}</span>
}

export function TextField({ label, path, value, onChange, max, required, hint, type = 'text', placeholder, className, mono, inputMode }: {
  label: ReactNode; path?: string; value: string; onChange: (v: string) => void; max?: number; required?: boolean; hint?: ReactNode
  type?: 'text' | 'url' | 'date' | 'datetime-local' | 'number' | 'tel'; placeholder?: string; className?: string; mono?: boolean
  inputMode?: 'text' | 'numeric' | 'url' | 'tel'
}) {
  return (
    <Field label={label} path={path} hint={hint} required={required} className={className} counter={<Counter value={value} max={max} />}>
      {({ id, describedBy, invalid, disabled }) => (
        <input
          id={id} type={type} value={value} placeholder={placeholder} inputMode={inputMode} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-required={required || undefined}
          className={cn(inputCls, mono && 'font-mono text-[14px]')}
        />
      )}
    </Field>
  )
}

export function TextAreaField({ label, path, value, onChange, max, required, hint, rows = 4, placeholder, className, mono }: {
  label: ReactNode; path?: string; value: string; onChange: (v: string) => void; max?: number; required?: boolean; hint?: ReactNode
  rows?: number; placeholder?: string; className?: string; mono?: boolean
}) {
  return (
    <Field label={label} path={path} hint={hint} required={required} className={className} counter={<Counter value={value} max={max} />}>
      {({ id, describedBy, invalid, disabled }) => (
        <textarea
          id={id} rows={rows} value={value} placeholder={placeholder} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-required={required || undefined}
          className={cn(inputCls, 'resize-y leading-relaxed', mono && 'font-mono text-[13.5px]')}
        />
      )}
    </Field>
  )
}

export function SelectField<V extends string>({ label, path, value, onChange, options, required, hint, className, placeholder }: {
  label: ReactNode; path?: string; value: V | ''; onChange: (v: V) => void; options: readonly { value: V; label: string }[]
  required?: boolean; hint?: ReactNode; className?: string; placeholder?: string
}) {
  return (
    <Field label={label} path={path} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid, disabled }) => (
        <select
          id={id} value={value} onChange={(e) => onChange(e.target.value as V)} disabled={disabled}
          aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-required={required || undefined}
          className={cn(inputCls, 'appearance-auto pr-8')}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  )
}

export function CheckboxField({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId()
  // Les cases à cocher sont des options techniques : jamais traduites.
  const locked = useContext(TranslatingCtx)
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={locked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-night-300 text-leaf-500 accent-leaf-500 focus-visible:ring-2 focus-visible:ring-leaf-500" />
      <div>
        <label htmlFor={id} className="text-[14px] font-semibold text-night-900">{label}</label>
        {hint && <p id={`${id}-h`} className="text-[12.5px] text-night-600">{hint}</p>}
      </div>
    </div>
  )
}

export function FormSection({ title, description, children, id, path }: { title: string; description?: ReactNode; children: ReactNode; id?: string; path?: string }) {
  const flagged = useHasIssueUnder(path ?? '__none__')
  return (
    <section aria-labelledby={id ? `${id}-t` : undefined} className={cn('rounded-2xl border bg-white p-4 shadow-soft sm:p-5', flagged ? 'border-alert-300' : 'border-[#E5E7EB]')}>
      <h2 id={id ? `${id}-t` : undefined} className="text-[16px] font-extrabold text-night-900">
        {title}
        {flagged && <span className="ml-2 rounded-full bg-alert-50 px-2 py-0.5 text-[11.5px] font-bold text-alert-600">À corriger</span>}
      </h2>
      {description && <p className="mt-0.5 text-[13px] text-night-600">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/** Éditeur générique de liste ordonnée (ajout, suppression, déplacement). */
export function Repeater<T>({ label, path, items, onChange, make, render, itemTitle, max = 50, addLabel = 'Ajouter', min = 0 }: {
  label: string; path: string; items: T[]; onChange: (items: T[]) => void; make: () => NoInfer<T>
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
  itemTitle: (item: T, index: number) => string; max?: number; addLabel?: string; min?: number
}) {
  const error = useIssue(path)
  // Traduction : mêmes éléments, dans le même ordre que le français (ni ajout, ni retrait, ni déplacement).
  const fixed = useContext(TranslatingCtx)
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <fieldset className="min-w-0" data-field-path={path}>
      <legend className="sr-only">{label}</legend>
      {error && <p role="alert" className="mb-2 text-[12.5px] font-semibold text-alert-600">{error}</p>}
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-xl border border-night-100 bg-[#fafbfc] p-3">
            <div className="mb-2 flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-night-700">
                <span className="mr-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-night-100 px-1.5 text-[11.5px] text-night-800">{i + 1}</span>
                {itemTitle(it, i) || 'Nouvel élément'}
              </p>
              {!fixed && (
                <>
                  <button type="button" className={iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter l’élément ${i + 1}`}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Descendre l’élément ${i + 1}`}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className={cn(iconBtn, 'hover:text-alert-600')} onClick={() => onChange(items.filter((_, k) => k !== i))} disabled={items.length <= min} aria-label={`Retirer l’élément ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>
            <div className="space-y-3">{render(it, (patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}</div>
          </li>
        ))}
      </ol>
      {items.length < max && !fixed && (
        <button type="button" onClick={() => onChange([...items, make()])} className={cn(btnSecondary, 'mt-3 border-dashed')}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
        </button>
      )}
    </fieldset>
  )
}

/** Liste de textes simples (une ligne par entrée). */
export function StringList({ label, path, items, onChange, max = 30, itemMax, addLabel = 'Ajouter une ligne', multiline, placeholder, min = 0 }: {
  label: string; path: string; items: string[]; onChange: (v: string[]) => void; max?: number; itemMax?: number
  addLabel?: string; multiline?: boolean; placeholder?: string; min?: number
}) {
  return (
    <Repeater
      label={label} path={path} items={items} onChange={onChange} make={() => ''} max={max} addLabel={addLabel} min={min}
      itemTitle={(s) => (s.length > 60 ? `${s.slice(0, 60)}…` : s)}
      render={(s, _u, i) => multiline ? (
        <TextAreaField label={`${label} ${i + 1}`} path={`${path}.${i}`} value={s} rows={2} max={itemMax} placeholder={placeholder}
          onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} />
      ) : (
        <TextField label={`${label} ${i + 1}`} path={`${path}.${i}`} value={s} max={itemMax} placeholder={placeholder}
          onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} />
      )}
    />
  )
}
