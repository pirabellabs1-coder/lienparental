'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import {
  NEUTRAL_GARDE_NAMES, custodyOfDay, handoversOnDay, holidayAt, type GardeConfig, type GardeNames,
} from '@/lib/garde'
import { useGardeFormat } from './useGardeFormat'

type Props = {
  month: Date
  config: GardeConfig
  today: Date
  /** Prénoms (useGardeNames) ; formulation neutre par défaut. */
  names?: GardeNames
}

// Noms des jours (lundi en premier) : useGardeFormat().weekdays (Intl, langue active).

/** Semaines (lundi → dimanche) couvrant le mois. */
function monthWeeks(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks: Date[][] = []
  let cursor = start
  while (cursor <= last) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i))
    }
    weeks.push(week)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
  }
  return weeks
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Calendrier mensuel de garde. Tableau sémantique (lecture ligne par ligne au lecteur d'écran) :
 * chaque cellule annonce le lieu de garde et, le cas échéant, l'heure de l'échange.
 * La couleur n'est jamais le seul indice : barre + icône d'échange + texte masqué.
 */
export function CustodyMonth({ month, config, today, names = NEUTRAL_GARDE_NAMES }: Props) {
  const t = useTranslations('calendar.custody')
  const f = useGardeFormat(names)
  const weeks = monthWeeks(month)
  const caption = f.monthYear(month)

  return (
    <table className="w-full table-fixed border-separate border-spacing-1">
      <caption className="sr-only">{t('caption', { month: caption })}</caption>
      <thead>
        <tr>
          {f.weekdays.map((d) => (
            <th key={d.short} scope="col" className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-night-500 md:text-[11px]">
              <abbr title={d.long} className="no-underline">{d.short}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].toISOString()}>
            {week.map((day) => {
              const inMonth = day.getMonth() === month.getMonth()
              if (!inMonth) return <td key={day.toISOString()} aria-hidden="true" />
              const who = custodyOfDay(config, day)
              const swaps = handoversOnDay(config, day)
              const isToday = sameDay(day, today)
              const holiday = f.holiday(holidayAt(config, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)))
              return (
                <td
                  key={day.toISOString()}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'relative h-12 rounded-lg p-0 align-top md:h-16',
                    who === 'moi' ? 'bg-leaf-50' : 'bg-sky-50',
                    isToday && 'ring-2 ring-inset ring-night-900',
                  )}
                >
                  <span className="flex h-full flex-col items-center justify-between pb-1.5 pt-1">
                    <span className={cn('text-[13px] tabular-nums text-night-900 md:text-sm', isToday ? 'font-extrabold' : 'font-medium')}>
                      {day.getDate()}
                    </span>
                    {swaps.length > 0 && (
                      <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5 text-night-700" strokeWidth={2.2} />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn('h-1 w-5 rounded-full', who === 'moi' ? 'bg-leaf-400' : 'bg-sky-400')}
                    />
                  </span>
                  <span className="sr-only">
                    {`${isToday ? t('todayPrefix') : ''}${who === 'moi' ? t('atMine') : t('atOther', f.who)}`}
                    {swaps.map((s) => (s.to === 'moi' ? t('swapToMe', { time: f.hour(s.date) }) : t('swapToOther', { time: f.hour(s.date), ...f.who }))).join('')}
                    {holiday ? `, ${holiday}` : ''}
                  </span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CustodyLegend({ names = NEUTRAL_GARDE_NAMES }: { names?: GardeNames }) {
  const t = useTranslations('calendar.custody')
  const who = { coParent: names.coParent, known: names.coParentKnown ? 'yes' : 'no' }
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-night-700" aria-label={t('legend')}>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-md bg-leaf-50 ring-1 ring-inset ring-leaf-200">
          <span className="h-1 w-3 rounded-full bg-leaf-400" />
        </span>
        {t('legendMine')}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-md bg-sky-50 ring-1 ring-inset ring-sky-200">
          <span className="h-1 w-3 rounded-full bg-sky-400" />
        </span>
        {t('legendOther', who)}
      </li>
      <li className="flex items-center gap-2">
        <ArrowLeftRight aria-hidden="true" className="h-4 w-4 text-night-700" strokeWidth={2.2} />
        {t('legendSwap')}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-4 w-4 rounded-md ring-2 ring-inset ring-night-900" />
        {t('legendToday')}
      </li>
    </ul>
  )
}
