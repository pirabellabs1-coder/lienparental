'use client'
/**
 * Sélecteur d'heure de l'application (remplace <input type="time">).
 * Le sélecteur natif d'Android est une fenêtre système : avec une taille d'affichage ou de police
 * agrandie, elle déborde de l'écran et son bouton de validation devient inaccessible. Celui-ci est
 * une fenêtre <dialog> de la page : elle tient toujours dans l'écran (largeur bornée, défilement interne).
 * Valeur au format « HH:MM » (24 h), comme l'input natif ; '' = aucune heure.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const STEP_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const pad = (n: number) => String(n).padStart(2, '0')

export function parseTime(v: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v)
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null
}

export function TimePicker({
  value, onChange, id, label, required, invalid, describedBy, className, allowClear = !required,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  /** Libellé accessible du bouton (le libellé visible reste géré par le formulaire). */
  label: string
  required?: boolean
  invalid?: boolean
  describedBy?: string
  className?: string
  allowClear?: boolean
}) {
  const t = useTranslations('shared.timePicker')
  const locale = useLocale()
  const autoId = useId()
  const titleId = `${autoId}-title`
  const ref = useRef<HTMLDialogElement>(null)
  const current = parseTime(value)
  const [h, setH] = useState<number | null>(current?.h ?? null)
  const [m, setM] = useState<number | null>(current?.m ?? null)

  // Minutes proposées : pas de 5 min, plus la minute exacte déjà enregistrée si elle n'en fait pas partie.
  const minutes = current && !STEP_MINUTES.includes(current.m) ? [...STEP_MINUTES, current.m].sort((a, b) => a - b) : STEP_MINUTES

  const open = () => {
    setH(current?.h ?? null)
    setM(current?.m ?? null)
    ref.current?.showModal()
  }
  const close = () => ref.current?.close()
  const confirm = () => {
    if (h === null) return
    onChange(`${pad(h)}:${pad(m ?? 0)}`)
    close()
  }

  // Fermeture au clic sur le fond.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onClick = (e: MouseEvent) => { if (e.target === d) d.close() }
    d.addEventListener('click', onClick)
    return () => d.removeEventListener('click', onClick)
  }, [])

  const display = current
    ? new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, current.h, current.m)))
    : ''

  const chip = (selected: boolean) => cn(
    'h-11 rounded-xl text-[15px] font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
    selected ? 'bg-leaf-600 text-white shadow-sm' : 'bg-night-50 text-night-800 hover:bg-night-100',
  )

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={open}
        aria-haspopup="dialog"
        aria-label={display ? `${label} : ${display}` : label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={cn('flex h-12 w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 text-left text-[15px] text-night-900', invalid ? 'border-alert-400' : 'border-night-100', className)}
      >
        <span className={cn('tabular-nums', !display && 'text-night-400')}>{display || t('placeholder')}</span>
        <Clock aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(22rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-white p-0 text-night-900 shadow-2xl backdrop:bg-night-950/50"
      >
        <div className="p-5">
          <p id={titleId} className="text-[17px] font-bold">{t('title')}</p>
          <p className="mt-1 text-[28px] font-extrabold tabular-nums text-leaf-700" aria-live="polite">
            {h === null ? '--' : pad(h)}:{m === null ? '--' : pad(m)}
          </p>

          <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-night-500" id={`${autoId}-h`}>{t('hours')}</p>
          <div role="radiogroup" aria-labelledby={`${autoId}-h`} className="mt-2 grid grid-cols-6 gap-1.5">
            {HOURS.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={h === x} onClick={() => setH(x)} className={chip(h === x)}>{pad(x)}</button>
            ))}
          </div>

          <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-night-500" id={`${autoId}-m`}>{t('minutes')}</p>
          <div role="radiogroup" aria-labelledby={`${autoId}-m`} className="mt-2 grid grid-cols-6 gap-1.5">
            {minutes.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={m === x} onClick={() => setM(x)} className={chip(m === x)}>{pad(x)}</button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {allowClear && value && (
              <button type="button" onClick={() => { onChange(''); close() }} className="mr-auto h-11 rounded-xl px-3 text-[15px] font-semibold text-night-600 hover:bg-night-50">
                {t('clear')}
              </button>
            )}
            <button type="button" onClick={close} className="h-11 rounded-xl px-4 text-[15px] font-semibold text-night-700 hover:bg-night-50">
              {t('cancel')}
            </button>
            <button type="button" onClick={confirm} disabled={h === null} className="h-11 rounded-xl bg-leaf-600 px-5 text-[15px] font-bold text-white hover:bg-leaf-700 disabled:opacity-50">
              {t('confirm')}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
