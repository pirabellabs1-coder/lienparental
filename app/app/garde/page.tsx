'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, CalendarPlus, MapPin, Settings2, Users } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { PeriodNav } from '@/components/calendrier/CalendarHeader'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { CustodyLegend, CustodyMonth } from '@/components/garde/CustodyMonth'
import { downloadText, takeGardeFlash } from '@/components/garde/store'
import { useGardeNames } from '@/components/garde/useGardeNames'
import { fetchGardeConfig } from '@/lib/data/garde'
import { cn } from '@/lib/cn'
import {
  buildHandoversIcs, capitalize, childrenVerb, computeCustody, custodyOfDay, fmtHandoverDate,
  handoversBetween, holidayAt, lieuLabel, nextHandover, RYTHME_LABELS, type GardeConfig,
} from '@/lib/garde'

const card = 'rounded-2xl border border-night-100 bg-white shadow-[0_1px_2px_rgba(11,45,91,0.05),0_12px_30px_-18px_rgba(11,45,91,0.2)]'
const btnSecondary =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-[14px] font-semibold text-night-900 transition hover:bg-night-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400'

// Planning de garde (vue mois). Configuration : garde_configs (Supabase) ou sessionStorage (démo).
// Prénoms : enfants du compte et parent lié (useGardeNames), formulation neutre si inconnus.
export default function GardePage() {
  const today = useClientNow()
  const names = useGardeNames()
  const [config, setConfig] = useState<GardeConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [month, setMonth] = useState<Date | null>(null)
  const { announce, node: announcer } = useAnnounce()

  useEffect(() => {
    if (!today) return
    let alive = true
    // Supabase : garde_configs (RLS user_id) ; démo : sessionStorage. Défaut si rien d'enregistré.
    setLoadError(null)
    fetchGardeConfig(today)
      .then((c) => alive && setConfig(c))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Chargement du planning impossible.'))
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
      period: same >= 4 ? 'Cette semaine' : 'En ce moment',
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
      announce("Aucun échange prévu sur les 3 prochains mois.")
      return
    }
    downloadText(buildHandoversIcs(config, list, new Date(), names), 'planning-de-garde.ics', 'text/calendar;charset=utf-8')
    announce(`${list.length} échanges ajoutés au fichier agenda.`)
  }

  const shift = (n: number) => month && setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <>
      <TopBar title="Planning de garde" showBack backHref="/app" />

      {loadError && !config ? (
        <ErrorState compact description={loadError} primary={{ label: 'Réessayer', onClick: () => setAttempt((n) => n + 1) }} secondary={{ label: "Retour à l'accueil", href: '/app' }} />
      ) : !config || !month || !today || !summary ? (
        <LoadingState compact title="Chargement du planning" description="" />
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
                    {summary.period}, {names.children} {childrenVerb(names, 'sont', 'est')} {summary.now === 'moi' ? 'avec vous' : `avec ${names.coParent}`}
                  </h2>
                  <p className="mt-0.5 text-xs text-night-600">
                    {RYTHME_LABELS[config.rythme]}
                    {summary.holiday ? ` · ${summary.holiday}` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl bg-night-50/70 p-3">
                <ArrowLeftRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-night-700" strokeWidth={2.2} />
                {summary.next ? (
                  <p className="text-[13px] text-night-900">
                    <span className="font-bold">Prochain échange : </span>
                    {fmtHandoverDate(summary.next.date)}, {lieuLabel(config, names)}
                    <span className="mt-0.5 block text-xs text-night-600">
                      {capitalize(names.children)} {summary.next.to === 'moi' ? `${childrenVerb(names, 'reviennent', 'revient')} chez vous` : `${childrenVerb(names, 'vont', 'va')} chez ${names.coParent}`}.
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] text-night-700">Aucun échange prévu dans les 60 prochains jours.</p>
                )}
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 lg:justify-center">
              <button type="button" onClick={exportIcs} className={btnSecondary}>
                <CalendarPlus aria-hidden="true" className="h-[18px] w-[18px]" />
                Ajouter à mon agenda
              </button>
              <Link href="/app/garde/configurer" className={btnSecondary}>
                <Settings2 aria-hidden="true" className="h-[18px] w-[18px]" />
                Modifier le planning
              </Link>
              <p className="text-center text-[11px] text-night-500">Fichier .ics des échanges des 3 prochains mois</p>
            </div>
          </div>

          {/* Calendrier */}
          <section aria-labelledby="garde-month" className={cn(card, 'p-3 md:p-4')}>
            <h2 id="garde-month" className="sr-only">Calendrier de garde</h2>
            <PeriodNav
              label={month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              onPrev={() => shift(-1)}
              onNext={() => shift(1)}
              prevLabel="Mois précédent"
              nextLabel="Mois suivant"
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
            <h2 id="garde-next" className="mb-2.5 text-[15px] font-bold text-night-900">Prochains échanges</h2>
            {summary.upcoming.length === 0 ? (
              <p className={cn(card, 'p-4 text-[13px] text-night-600')}>Aucun échange dans les 4 prochaines semaines.</p>
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
                      <span className="block text-[13px] font-bold text-night-900 first-letter:uppercase">{fmtHandoverDate(h.date)}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-night-600">
                        {h.to === 'moi' ? 'Retour chez vous' : `Départ chez ${names.coParent}`}
                        <span aria-hidden="true">·</span>
                        <MapPin aria-hidden="true" className="h-3 w-3" />
                        <span className="truncate">{lieuLabel(config, names)}</span>
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
