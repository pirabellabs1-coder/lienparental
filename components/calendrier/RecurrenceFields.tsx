'use client'

import { useId, useMemo } from 'react'
import { ChevronDown, Repeat } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { FieldLabel } from '@/components/journal/FormFields'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { cn } from '@/lib/cn'
import { ZONE_CALENDAR_UNTIL, ZONE_OPTIONS, type ZoneScolaire } from '@/lib/garde'
import { dayOf } from '@/lib/calendrier'
import { WEEKDAYS, expandSeries, parseRule, type HolidayPart, type HolidayYears, type RepeatPreset } from '@/lib/recurrence'
import { buildRule, nthOf, weekdayOf, type EndMode, type RecurrenceState, type RepeatUnit } from '@/lib/recurrence-form'
import { fmtDayKey, wallTimeToIso } from '@/lib/tz'

// Bloc « Répétition » du formulaire d'événement : choix rapide, puis seulement les réglages utiles
// (jours, mensuel, intervalle, vacances scolaires), fin de répétition et aperçu des prochaines dates.

const PRESETS: RepeatPreset[] = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'holidays', 'custom']
const UNITS: RepeatUnit[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
const PREVIEW = 5

export const selectCls =
  'block h-12 w-full appearance-none rounded-xl border border-night-100 bg-white px-4 pr-11 text-[13px] text-night-900 ' +
  'transition-colors focus:outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20'
const inputCls =
  'h-12 rounded-xl border border-night-100 bg-white px-3 text-[13px] text-night-900 focus:outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20'

function SelectBox({ id, value, onChange, children, label }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode; label?: string }) {
  return (
    <div className="relative">
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>{children}</select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
    </div>
  )
}

export function RecurrenceFields({
  value, onChange, startDay, startTime, endDay, endTime, tz,
}: {
  value: RecurrenceState
  onChange: (next: RecurrenceState) => void
  /** Début de l'événement (jour + heure murale dans `tz`) : sert aux libellés et à l'aperçu. */
  startDay: string
  startTime: string
  endDay: string
  endTime: string
  tz: string
}) {
  const t = useTranslations('calendar.recurrence')
  const f = useCalFormat()
  const locale = useLocale()
  const id = useId()
  const s = value
  const set = (patch: Partial<RecurrenceState>) => onChange({ ...s, ...patch })
  const startWeekday = startDay ? weekdayOf(startDay) : 'MO'
  const weekly = s.preset === 'weekly' || s.preset === 'biweekly' || (s.preset === 'custom' && s.unit === 'WEEKLY')
  const monthly = s.preset === 'monthly' || (s.preset === 'custom' && s.unit === 'MONTHLY')
  const days = s.days.length ? s.days : [startWeekday]
  const dayIndex = (d: string) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number])
  const nth = startDay ? nthOf(startDay) : 1
  const weekdayLong = f.weekdays[dayIndex(startWeekday)]?.long ?? ''

  const rule = useMemo(() => buildRule(s, startDay, tz), [s, startDay, tz])
  const preview = useMemo(() => {
    const parsed = parseRule(rule)
    if (!parsed || !startDay || !endDay) return null
    try {
      const start = wallTimeToIso(startDay, startTime || '09:00', tz)
      const end = wallTimeToIso(endDay, endTime || startTime || '09:00', tz)
      const series = { start, end: Date.parse(end) < Date.parse(start) ? start : end, tz, rule: parsed }
      const far = new Date(Date.parse(start) + 3 * 366 * 86_400_000).toISOString()
      return expandSeries(series, start, far).slice(0, PREVIEW + 1)
    } catch {
      return null
    }
  }, [rule, startDay, startTime, endDay, endTime, tz])

  const untilNote = (zone: ZoneScolaire) => fmtDayKey(ZONE_CALENDAR_UNTIL[zone], { day: 'numeric', month: 'long', year: 'numeric' }, locale)
  const endModes: EndMode[] = s.preset === 'holidays' ? ['never', 'until'] : ['never', 'until', 'count']

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">{t('title')}</legend>
      <div>
        <FieldLabel htmlFor={`${id}-preset`}>
          <span className="inline-flex items-center gap-1.5"><Repeat aria-hidden="true" className="h-4 w-4 text-leaf-600" />{t('title')}</span>
        </FieldLabel>
        <SelectBox id={`${id}-preset`} value={s.preset} onChange={(v) => set({ preset: v as RepeatPreset, ...(v === 'holidays' && s.end === 'count' ? { end: 'never' } : {}) })}>
          {PRESETS.map((p) => <option key={p} value={p}>{t(`presets.${p}`, { weekday: weekdayLong })}</option>)}
        </SelectBox>
      </div>

      {s.preset !== 'none' && (
        <div className="space-y-4 rounded-2xl border border-night-100 bg-night-50/40 p-3.5">
          {s.preset === 'custom' && (
            <div>
              <FieldLabel htmlFor={`${id}-interval`}>{t('every')}</FieldLabel>
              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <input
                  id={`${id}-interval`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={s.interval}
                  onChange={(e) => set({ interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
                  className={cn(inputCls, 'text-center')}
                />
                <SelectBox id={`${id}-unit`} label={t('unitLabel')} value={s.unit} onChange={(v) => set({ unit: v as RepeatUnit })}>
                  {UNITS.map((u) => <option key={u} value={u}>{t(`units.${u}`, { count: s.interval })}</option>)}
                </SelectBox>
              </div>
            </div>
          )}

          {weekly && (
            <fieldset>
              <FieldLabel as="legend">{t('days')}</FieldLabel>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d, i) => {
                  const on = days.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={f.weekdays[i].long}
                      onClick={() => {
                        const next = on ? days.filter((x) => x !== d) : [...days, d]
                        set({ days: next.length ? next : [startWeekday] })
                      }}
                      className={cn(
                        'h-11 rounded-xl text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                        on ? 'bg-leaf-500 text-white' : 'border border-night-100 bg-white text-night-800 hover:bg-night-50',
                      )}
                    >
                      {f.weekdays[i].short.slice(0, 2)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {monthly && startDay && (
            <div>
              <FieldLabel htmlFor={`${id}-monthly`}>{t('monthlyLabel')}</FieldLabel>
              <SelectBox id={`${id}-monthly`} value={s.monthly} onChange={(v) => set({ monthly: v as RecurrenceState['monthly'] })}>
                <option value="day">{t('monthlyDay', { day: Number(startDay.slice(8, 10)) })}</option>
                <option value="nth">{t('monthlyNth', { nth: t(`nth.${nth === -1 ? 'last' : nth}`), weekday: weekdayLong })}</option>
              </SelectBox>
            </div>
          )}

          {s.preset === 'holidays' && (
            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor={`${id}-zone`}>{t('zone')}</FieldLabel>
                <SelectBox id={`${id}-zone`} value={s.zone} onChange={(v) => set({ zone: v as ZoneScolaire })}>
                  {ZONE_OPTIONS.map((z) => <option key={z.value} value={z.value}>{t(`zones.${z.value}`)}</option>)}
                </SelectBox>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div>
                  <FieldLabel htmlFor={`${id}-part`}>{t('part')}</FieldLabel>
                  <SelectBox id={`${id}-part`} value={s.part} onChange={(v) => set({ part: v as HolidayPart })}>
                    {(['ALL', 'FIRST', 'SECOND'] as const).map((p) => <option key={p} value={p}>{t(`parts.${p}`)}</option>)}
                  </SelectBox>
                </div>
                <div>
                  <FieldLabel htmlFor={`${id}-years`}>{t('years')}</FieldLabel>
                  <SelectBox id={`${id}-years`} value={s.years} onChange={(v) => set({ years: v as HolidayYears })}>
                    {(['ALL', 'EVEN', 'ODD'] as const).map((y) => <option key={y} value={y}>{t(`yearsOptions.${y}`)}</option>)}
                  </SelectBox>
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-night-600">{t('holidayHint', { date: untilNote(s.zone) })}</p>
            </div>
          )}

          <fieldset>
            <FieldLabel as="legend">{t('endLabel')}</FieldLabel>
            <div className={cn('grid gap-1.5', endModes.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {endModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={s.end === m}
                  onClick={() => set({ end: m, ...(m === 'until' && !s.untilDate && startDay ? { untilDate: `${startDay.slice(0, 4)}-12-31` } : {}) })}
                  className={cn(
                    'min-h-[44px] rounded-xl px-2 text-[12.5px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                    s.end === m ? 'bg-night-900 text-white' : 'border border-night-100 bg-white text-night-800 hover:bg-night-50',
                  )}
                >
                  {t(`end.${m}`)}
                </button>
              ))}
            </div>
            {s.end === 'until' && (
              <div className="mt-2.5">
                <label htmlFor={`${id}-until`} className="mb-1 block text-[12px] font-semibold text-night-700">{t('untilLabel')}</label>
                <input id={`${id}-until`} type="date" min={startDay} value={s.untilDate} onChange={(e) => set({ untilDate: e.target.value })} className={cn(inputCls, 'w-full appearance-none')} />
              </div>
            )}
            {s.end === 'count' && (
              <div className="mt-2.5 flex items-center gap-2">
                <label htmlFor={`${id}-count`} className="sr-only">{t('countLabel')}</label>
                <input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={730}
                  value={s.count}
                  onChange={(e) => set({ count: Math.min(730, Math.max(1, Number(e.target.value) || 1)) })}
                  className={cn(inputCls, 'w-24 text-center')}
                />
                <span className="text-[13px] text-night-700">{t('countSuffix', { count: s.count })}</span>
              </div>
            )}
          </fieldset>

          <div aria-live="polite">
            <p className="text-[12px] font-bold text-night-900">{t('preview')}</p>
            {!preview || preview.length === 0 ? (
              <p className="mt-1 text-[12px] text-night-600">{t('previewNone')}</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {preview.slice(0, PREVIEW).map((o) => (
                  <li key={o.key} className="flex items-baseline justify-between gap-3 text-[12.5px] text-night-800">
                    <span className="first-letter:uppercase">{f.dayLong(dayOf(o.start))}{dayOf(o.start).getUTCFullYear() !== new Date().getFullYear() ? ` ${dayOf(o.start).getUTCFullYear()}` : ''}</span>
                    <span className="shrink-0 tabular-nums text-night-600">{f.hour(o.start)}</span>
                  </li>
                ))}
                {preview.length > PREVIEW && <li className="text-[12px] text-night-500">{t('previewMore')}</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </fieldset>
  )
}
