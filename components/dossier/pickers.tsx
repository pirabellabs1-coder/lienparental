'use client'

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import type { Child } from '@/lib/mock-data'
import { useChildLabels } from '@/components/enfants/childLabels'
import { PERIOD_PRESETS, presetPeriod, type Period, type PeriodPreset } from './data'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'

/** Choix de l'enfant concerné (boutons radio natifs, cibles ≥ 44 px). */
export function ChildPicker({ children, value, onChange }: { children: Child[]; value: string; onChange: (id: string) => void }) {
  const t = useTranslations('family.courtFile.pickers')
  const labels = useChildLabels()
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2.5 text-[15px] font-bold text-night-900">{t('child')}</legend>
      <div className="grid grid-cols-2 gap-2.5">
        {children.map((c) => {
          const checked = c.id === value
          return (
            <label
              key={c.id}
              className={cn(
                'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                checked ? 'border-leaf-500 bg-leaf-50' : 'border-night-200 bg-white hover:bg-night-50',
              )}
            >
              <input type="radio" name={name} value={c.id} checked={checked} onChange={() => onChange(c.id)} className="sr-only" />
              <span aria-hidden="true" className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold', checked ? 'bg-leaf-500 text-white' : 'bg-night-50 text-night-700')}>
                {c.prenom.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-night-900">{c.prenom}</span>
                <span className="block truncate text-[12px] text-night-600">{labels.ageLabel(c)}{c.classe ? ` · ${labels.classLabel(c.classe)}` : ''}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Période : préréglages ou dates personnalisées (début ≤ fin). */
export function PeriodPicker({
  preset, period, onChange, error,
}: {
  preset: PeriodPreset
  period: Period
  onChange: (preset: PeriodPreset, period: Period) => void
  error?: string | null
}) {
  const t = useTranslations('family.courtFile.pickers')
  const uid = useId()
  return (
    <fieldset>
      <legend className="mb-2.5 text-[15px] font-bold text-night-900">{t('period')}</legend>
      <div className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((p) => {
          const active = p.value === preset
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(p.value, p.value === 'custom' ? period : presetPeriod(p.value))}
              className={cn(
                'inline-flex h-11 items-center rounded-full border px-4 text-[13px] font-semibold transition-colors',
                focusRing,
                active ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-200 bg-white text-night-900 hover:bg-night-50',
              )}
            >
              {t(`presets.${p.value}`)}
            </button>
          )
        })}
      </div>
      {preset === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor={`${uid}-from`} className="block text-[12px] font-semibold text-night-800">{t('from')}</label>
            <input
              id={`${uid}-from`}
              type="date"
              value={period.from}
              max={period.to}
              onChange={(e) => e.target.value && onChange('custom', { ...period, from: e.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-err` : undefined}
              className="mt-1 h-12 w-full rounded-xl border border-night-200 bg-white px-3 text-[14px] text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-to`} className="block text-[12px] font-semibold text-night-800">{t('to')}</label>
            <input
              id={`${uid}-to`}
              type="date"
              value={period.to}
              min={period.from}
              onChange={(e) => e.target.value && onChange('custom', { ...period, to: e.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-err` : undefined}
              className="mt-1 h-12 w-full rounded-xl border border-night-200 bg-white px-3 text-[14px] text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
            />
          </div>
        </div>
      )}
      {error && <p id={`${uid}-err`} role="alert" className="mt-2 text-[12px] font-semibold text-alert-600">{error}</p>}
    </fieldset>
  )
}

/** Ligne case à cocher (libellé, description, compteur), entièrement cliquable. */
export function CheckRow({
  checked, onChange, icon, label, description, count, countLabel, disabled, children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  icon: ReactNode
  label: string
  description?: string
  count?: number
  countLabel?: string
  disabled?: boolean
  children?: ReactNode
}) {
  const t = useTranslations('family.courtFile.pickers')
  const uid = useId()
  return (
    <div className={cn('rounded-xl border transition-colors', checked ? 'border-leaf-200 bg-leaf-50/40' : 'border-night-100 bg-white')}>
      <label htmlFor={uid} className={cn('flex min-h-[56px] cursor-pointer items-center gap-3 p-3', disabled && 'cursor-not-allowed opacity-60')}>
        <input
          id={uid}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={description ? `${uid}-d` : undefined}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border-night-300 accent-[#2e7d32] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2"
        />
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-night-700 ring-1 ring-night-100">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-night-900">{label}</span>
          {description && <span id={`${uid}-d`} className="block text-[12px] text-night-600">{description}</span>}
        </span>
        {count !== undefined && (
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums', count > 0 ? 'bg-night-50 text-night-800' : 'bg-night-50/60 text-night-500')}>
            {count}<span className="sr-only"> {countLabel ?? t('items')}</span>
          </span>
        )}
      </label>
      {children}
    </div>
  )
}
