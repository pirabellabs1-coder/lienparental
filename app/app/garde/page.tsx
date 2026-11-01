'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, CalendarHeart, CalendarPlus, MapPin, Settings2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { PeriodNav } from '@/components/calendrier/CalendarHeader'
import { useGardeNow } from '@/components/garde/useGardeNow'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { CustodyLegend, CustodyMonth } from '@/components/garde/CustodyMonth'
import { downloadText, takeGardeFlash } from '@/components/garde/store'
import { useGardeNames } from '@/components/garde/useGardeNames'
import { useGardeFormat } from '@/components/garde/useGardeFormat'
import { fetchGardeState } from '@/lib/data/garde'
import { cn } from '@/lib/cn'
import {
  buildHandoversIcs, capitalize, computeCustody, custodyOfDay,
  handoversBetween, holidayAt, nextHandover, type GardeConfig,
} from '@/lib/garde'

const card = 'rounded-2xl border border-night-100 bg-white shadow-[0_1px_2px_rgba(11,45,91,0.05),0_12px_30px_-18px_rgba(11,45,91,0.2)]'
const btnSecondary =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-[14px] font-semibold text-night-900 transition hover:bg-night-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400'

// Planning de garde (vue mois). Configuration : garde_configs (Supabase) ou sessionStorage (démo).
// Prénoms : enfants du compte et parent lié (useGardeNames), formulation neutre si inconnus.
// Sans planning enregistré : écran de création, jamais le planning par défaut présenté comme réel.
export default function GardePage() {
  const today = useGardeNow()
  const names = useGardeNames()
  const t = useTranslations('calendar')
  const f = useGardeFormat(names)
  const [config, setConfig] = useState<GardeConfig | null>(null)
  const [saved, setSaved] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [month, setMonth] = useState<Date | null>(null)
  const { announce, node: announcer } = useAnnounce()

  useEffect(() => {
    if (!today) return
    let alive = true
    // Supabase : garde_configs (RLS user_id) ; démo : sessionStorage.
    setLoadError(null)
    fetchGardeState(today)
      .then((s) => {
        if (!alive) return
        setSaved(s.saved)
        setConfig(s.config)
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : t('custody.loadFailed')))
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    const flash = takeGardeFlash()
    if (flash) announce(flash)
    return () => { alive = false }
  }, [today, announce, attempt])

  const summary = useMemo(() => {
    if (!config || !today) return null
    const now = computeCustody(config, today)
    // « Cette semaine » si ce parent a la majorité des jours de la semaine en cours, sinon « En ce moment ».
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
    let same = 0
    for (let i = 0; i < 7; i++) {
      if (custodyOfDay(config, new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)) === now) same++
    }
    const upcoming = handoversBetween(
      config, today, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 28, 23, 59),
    ).slice(0, 4)
    return {
      now,
      thisWeek: same >= 4,
      next: nextHandover(config, today),
      upcoming,
      holiday: holidayAt(config, today),
    }
  }, [config, today])

  function exportIcs() {
    if (!config || !today) return
    const end = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate(), 23, 59)
    const list = handoversBetween(config, today, end)
    if (list.length === 0) {
      announce(t('custody.noExport'))
      return
    }
    downloadText(buildHandoversIcs(config, list, new Date(), names, f.icsText(config)), t('custody.fileName'), 'text/calendar;charset=utf-8')
    announce(t('custody.exported', { count: list.length }))
  }

  const shift = (n: number) => month && setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <>
      <TopBar title={t('custody.title')} showBack backHref="/app" />

      {loadError && !config ? (
        <ErrorState compact description={loadError} primary={{ label: t('common.retry'), onClick: () => setAttempt((n) => n + 1) }} secondary={{ label: t('custody.backHome'), href: '/app' }} />
      ) : !config || !month || !today || !summary ? (
        <LoadingState compact title={t('custody.loading')} description="" />
      ) : !saved ? (
        <EmptyPlan />
      ) : (
        <div className="w-full space-y-5 px-5 pb-8 pt-2">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Résumé */}
            <section aria-labelledby="garde-now" className={cn(card, 'p-4')}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                    summary.now === 'moi' ? 'bg-leaf-50 text-leaf-600' : 'bg-sky-50 text-sky-700',
                  )}
                >
                  <Users className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="garde-now" className="text-[15px] font-bold leading-snug text-night-900">
                    {t(summary.now === 'moi' ? 'custody.nowWithMe' : 'custody.nowWithOther', {
                      period: summary.thisWeek ? t('custody.thisWeek') : t('custody.rightNow'),
                      children: names.children,
                      count: f.count,
                      ...f.who,
                    })}
                  </h2>
                  <p className="mt-0.5 text-xs text-night-600">
                    {f.rythme(config.rythme)}
                    {summary.holiday ? ` · ${f.holiday(summary.holiday)}` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl bg-night-50/70 p-3">
                <ArrowLeftRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-night-700" strokeWidth={2.2} />
                {summary.next ? (
                  <p className="text-[13px] text-night-900">
                    <span className="font-bold">{t('custody.nextLabel')}</span>
                    {f.handoverDate(summary.next.date)}, {f.lieu(config)}
                    <span className="mt-0.5 block text-xs text-night-600">
                      {t(summary.next.to === 'moi' ? 'custody.nextBackToMe' : 'custody.nextGoToOther', {
                        children: capitalize(names.children),
                        count: f.count,
                        ...f.who,
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] text-night-700">{t('custody.noNext')}</p>
                )}
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 lg:justify-center">
              <button type="button" onClick={exportIcs} className={btnSecondary}>
                <CalendarPlus aria-hidden="true" className="h-[18px] w-[18px]" />
                {t('custody.addToCalendar')}
              </button>
              <Link href="/app/garde/configurer" className={btnSecondary}>
                <Settings2 aria-hidden="true" className="h-[18px] w-[18px]" />
                {t('custody.edit')}
              </Link>
              <p className="text-center text-[11px] text-night-500">{t('custody.icsHint')}</p>
            </div>
          </div>

          {/* Calendrier */}
          <section aria-labelledby="garde-month" className={cn(card, 'p-3 md:p-4')}>
            <h2 id="garde-month" className="sr-only">{t('custody.monthHeading')}</h2>
            <PeriodNav
              label={f.monthYear(month)}
              onPrev={() => shift(-1)}
              onNext={() => shift(1)}
              prevLabel={t('common.prevMonth')}
              nextLabel={t('common.nextMonth')}
            />
            <div className="mt-1">
              <CustodyMonth month={month} config={config} today={today} names={names} />
            </div>
            <div className="mt-3 border-t border-night-100 px-1 pt-3">
              <CustodyLegend names={names} />
            </div>
          </section>

          {/* Prochains échanges */}
          <section aria-labelledby="garde-next">
            <h2 id="garde-next" className="mb-2.5 text-[15px] font-bold text-night-900">{t('custody.upcomingTitle')}</h2>
            {summary.upcoming.length === 0 ? (
              <p className={cn(card, 'p-4 text-[13px] text-night-600')}>{t('custody.noUpcoming')}</p>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {summary.upcoming.map((h) => (
                  <li key={h.date.toISOString()} className={cn(card, 'flex items-center gap-3 p-3.5')}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                        h.to === 'moi' ? 'bg-leaf-50 text-leaf-600' : 'bg-sky-50 text-sky-700',
                      )}
                    >
                      <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-night-900 first-letter:uppercase">{f.handoverDate(h.date)}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-night-600">
                        {h.to === 'moi' ? t('custody.returnHome') : t('custody.departOther', f.who)}
                        <span aria-hidden="true">·</span>
                        <MapPin aria-hidden="true" className="h-3 w-3" />
                        <span className="truncate">{f.lieu(config)}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {announcer}
    </>
  )
}

/** Aucun planning enregistré : ce que fait le planning, les 3 étapes, puis l'assistant. */
function EmptyPlan() {
  const t = useTranslations('calendar')
  const steps = [t('custody.emptyStep1'), t('custody.emptyStep2'), t('custody.emptyStep3')]
  return (
    <div className="w-full px-5 pb-8 pt-2">
      <section aria-labelledby="garde-empty" className={cn(card, 'mx-auto max-w-xl p-5 text-center')}>
        <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-leaf-50 text-leaf-600">
          <CalendarHeart className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <h2 id="garde-empty" className="mt-4 text-[18px] font-extrabold text-night-900">{t('custody.emptyTitle')}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-night-600">{t('custody.emptyText')}</p>
        <ol className="mt-5 space-y-3 text-left">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-night-900 text-[12px] font-bold text-white">{i + 1}</span>
              <span className="pt-0.5 text-[13.5px] leading-snug text-night-800">{s}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/app/garde/configurer"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white transition hover:bg-leaf-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2"
        >
          {t('custody.emptyCta')}
        </Link>
        <p className="mt-2 text-[12px] text-night-500">{t('custody.emptyHint')}</p>
      </section>
    </div>
  )
}
