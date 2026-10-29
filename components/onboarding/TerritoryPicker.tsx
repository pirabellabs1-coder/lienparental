'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TERRITORIES, TerritoryShape } from '@/components/site/territories'

/**
 * Choix du territoire du Guide parental (inscription, préférences du profil) : six cartes avec la
 * silhouette du territoire, groupe de boutons radio natifs (flèches au clavier, lecteurs d'écran).
 */
export function TerritoryPicker({ value, onChange, legend, help, error, className }: {
  value: string
  onChange: (code: string) => void
  legend: string
  help?: string
  error?: string
  className?: string
}) {
  const tTerr = useTranslations('shared.territories')
  const uid = useId()
  const describedBy = cn(help && `${uid}-help`, error && `${uid}-err`) || undefined
  return (
    <fieldset className={className} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="text-[15px] font-bold text-night-900">
        {legend} <span aria-hidden className="text-alert-500">*</span>
      </legend>
      {help && <p id={`${uid}-help`} className="mt-1 text-[13px] leading-relaxed text-night-600">{help}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {TERRITORIES.map((terr) => {
          const on = value === terr.code
          return (
            <label key={terr.code} className="cursor-pointer">
              <input
                type="radio"
                name={`${uid}-territoire`}
                value={terr.code}
                checked={on}
                onChange={() => onChange(terr.code)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'relative flex min-h-[60px] items-center gap-2.5 rounded-2xl px-3 py-2.5 ring-1 transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-500 peer-focus-visible:ring-offset-2',
                  on ? 'bg-leaf-50 ring-leaf-400' : 'bg-white ring-[#E5E7EB] hover:ring-leaf-200',
                  error && !on && 'ring-alert-300',
                )}
              >
                <TerritoryShape path={terr.path} available className="h-9 w-9 shrink-0" />
                <span className="min-w-0 text-[14px] font-semibold leading-tight text-night-900">{tTerr(terr.code)}</span>
                {on && (
                  <span aria-hidden className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-leaf-500 text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
      {error && <p id={`${uid}-err`} role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{error}</p>}
    </fieldset>
  )
}
