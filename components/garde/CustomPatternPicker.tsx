'use client'

import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { weekdayNames } from '@/components/calendrier/useCalFormat'
import { NEUTRAL_GARDE_NAMES, type GardeNames } from '@/lib/garde'

// Noms des jours (lundi en premier) : weekdayNames(locale) (Intl, langue active).

type Props = {
  value: boolean[]
  onChange: (next: boolean[]) => void
  error?: string
  errorId?: string
  /** Prénoms (useGardeNames) ; formulation neutre par défaut. */
  names?: GardeNames
}

/** Cycle de 14 jours : chaque bouton bascule « chez vous » / « chez l'autre parent ». */
export function CustomPatternPicker({ value, onChange, error, errorId, names = NEUTRAL_GARDE_NAMES }: Props) {
  const t = useTranslations('calendar.custody')
  const days = weekdayNames(useLocale())
  const who = { coParent: names.coParent, known: names.coParentKnown ? 'yes' : 'no' }
  const otherShort = names.coParentKnown ? `${names.coParent.slice(0, 3)}.` : t('picker.otherShort')
  const toggle = (i: number) => onChange(value.map((v, j) => (j === i ? !v : v)))

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-[13px] font-bold text-night-900">{t('picker.legend')}</legend>
      <p className="mt-1 text-xs text-night-600">
        {t('picker.hint')}
      </p>
      {[0, 1].map((w) => (
        <div key={w} className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-night-700">{t('picker.week', { n: w + 1 })}</p>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(({ short: d, long }, i) => {
              const idx = w * 7 + i
              const mine = value[idx]
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={mine}
                  aria-label={t('picker.dayLabel', { n: w + 1, day: long, where: mine ? t('atMine') : t('atOther', who) })}
                  onClick={() => toggle(idx)}
                  className={cn(
                    'flex h-12 flex-col items-center justify-center rounded-xl border text-[12px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400',
                    mine ? 'border-leaf-300 bg-leaf-50 text-leaf-800' : 'border-sky-200 bg-sky-50 text-sky-800',
                  )}
                >
                  {d}
                  <span aria-hidden="true" className="text-[10px] font-medium">{mine ? t('picker.me') : otherShort}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-alert-500">{error}</p>
      )}
    </fieldset>
  )
}
