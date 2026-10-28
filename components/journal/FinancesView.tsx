'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Filter, Info, Paperclip, Plus, ReceiptText, Repeat, Wallet,
} from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { deMonth, fmtMonthShort, fmtMonthYear, parseDay } from '@/components/journal/journalData'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import {
  DEPENSE_CATEGORIES, DEPENSE_SENS, DEPENSE_STATUTS, FINANCE_PERIODES,
  activeFilterCount, allJustificatifs, applyFinanceFilters, financeRange, fluxOf,
  montantRegleCents, recurrenceOf, resteDuCents, sensOf, shiftMonth, statutOf, totalsByChild, totalsByFlux,
  type DepenseStatut, type FinanceFilters, type FinancePeriode,
} from '@/lib/journal-finances'
import { useExpensesInRange } from '@/lib/data/journal'

/** Mention obligatoire : affichée sur la vue Finances, le formulaire et le détail d'une dépense. */
export function FinancesNotice({ className }: { className?: string }) {
  const fl = useFinanceLabels()
  return (
    <p className={cn('flex gap-2.5 rounded-xl border border-night-100 bg-night-50/60 px-3.5 py-3 text-[12px] leading-relaxed text-night-700', className)}>
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-night-700" strokeWidth={1.8} />
      <span>{fl.disclaimer()}</span>
    </p>
  )
}

/** Pastille de statut (texte toujours présent : la couleur n'est jamais seule porteuse de sens). */
export function StatutBadge({ statut, className }: { statut: DepenseStatut; className?: string }) {
  const fl = useFinanceLabels()
  if (statut === 'paye') return null
  const tone: Record<Exclude<DepenseStatut, 'paye'>, string> = {
    'en-attente': 'bg-night-50 text-night-800 ring-night-200',
    partiel: 'bg-night-50 text-night-800 ring-night-200',
    rembourse: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
    conteste: 'bg-alert-50 text-alert-700 ring-alert-200',
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tone[statut], className)}>
      {fl.statut(statut)}
    </span>
  )
}

type ChildOpt = { id: string; prenom: string }


/**
 * Vue « Finances » du Journal : période (mois navigable, 3 / 12 derniers mois, dates
 * personnalisées), filtres (sens, statut, catégorie, enfant), totaux par sens (dépensé /
 * reçu / solde) et par enfant, liste. Tout l'état vit dans l'URL (partageable, bouton retour).
 */
export function FinancesView({
  childOptions, childrenLoading = false, month, currentMonth, today, filters, basePath,
}: {
  childOptions: ChildOpt[]
  /** Enfants en cours de chargement : les totaux par enfant attendent (sinon tout irait dans « Sans enfant précisé »). */
  childrenLoading?: boolean
  /** Mois affiché "yyyy-mm" (période `mois`) */
  month: string
  /** Mois courant "yyyy-mm" dans le fuseau de l'utilisateur (borne de « mois suivant ») */
  currentMonth: string
  /** Jour courant "yyyy-mm-dd" dans le fuseau de l'utilisateur */
  today: string
  filters: FinanceFilters
  basePath: string
}) {
  const t = useTranslations('family.finances.view')
  const fl = useFinanceLabels()
  const loc = fl.locale
  const formatMontant = fl.money
  const formatTotals = fl.totals
  const formatSolde = fl.solde
  const fmtDayKey = (key: string, opts: Intl.DateTimeFormatOptions) =>
    parseDay(key).toLocaleDateString(intlLocale(loc), { ...opts, timeZone: 'UTC' })
  const sensOptions = DEPENSE_SENS.map((s) => ({ value: s, label: fl.sens(s) }))
  const statutOptions = DEPENSE_STATUTS.map((s) => ({ value: s, label: fl.statut(s) }))
  const categoryOptions = DEPENSE_CATEGORIES.map((c) => ({ value: c, label: fl.category(c) }))
  const router = useRouter()
  const uid = useId()
  const range = financeRange(filters, month, today)
  const { data, loading, error, refresh } = useExpensesInRange(range.fromDay, range.toDay)

  const items = useMemo(
    () => applyFinanceFilters((data ?? []).filter((e) => e.depense && e.date >= range.fromDay && e.date <= range.toDay), filters),
    [data, filters, range.fromDay, range.toDay],
  )
  const flux = totalsByFlux(items)
  const buckets = totalsByChild(items, childOptions)
  const nFilters = activeFilterCount(filters)
  // Changement de période : on n'affiche pas les données précédentes pendant le rechargement.
  const pending = loading

  // --- URL ------------------------------------------------------------------------
  const href = (patch: Partial<FinanceFilters> & { mois?: string }) => {
    const f = { ...filters, ...patch }
    const q = new URLSearchParams({ filtre: 'finances' })
    if (f.periode === 'mois') q.set('mois', patch.mois ?? month)
    else q.set('periode', f.periode)
    if (f.periode === 'perso') {
      if (f.du) q.set('du', f.du)
      if (f.au) q.set('au', f.au)
    }
    for (const k of ['sens', 'statut', 'categorie', 'enfant'] as const) if (f[k]) q.set(k, f[k]!)
    return `${basePath}?${q.toString()}`
  }
  const go = (patch: Partial<FinanceFilters>) => router.replace(href(patch), { scroll: false })

  const label = fmtMonthYear(parseDay(`${month}-01`), loc)
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const canNext = next <= currentMonth
  const periodLabel = filters.periode === 'mois'
    ? label
    : t('periodRange', {
      from: fmtDayKey(range.fromDay, { day: 'numeric', month: 'short', year: 'numeric' }),
      to: fmtDayKey(range.toDay, { day: 'numeric', month: 'short', year: 'numeric' }),
    })
  const names = (ids: string[]) => childOptions.filter((c) => ids.includes(c.id)).map((c) => c.prenom).join(', ')

  const navBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-night-100 bg-white text-night-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'
  const selectCls = 'block h-11 w-full appearance-none rounded-xl border border-night-100 bg-white px-3.5 text-[13px] text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500/20'
  const childFilterOptions = [...childOptions.map((c) => ({ value: c.id, label: c.prenom })), { value: '__aucun', label: t('noChild') }]

  return (
    <div className="space-y-4">
      {/* Période */}
      <section aria-labelledby={`${uid}-periode`} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <label id={`${uid}-periode`} htmlFor={`${uid}-p`} className="mb-1.5 block text-[12px] font-bold text-night-900">{t('period')}</label>
            <div className="relative">
              <select id={`${uid}-p`} className={cn(selectCls, 'pr-9')} value={filters.periode} onChange={(e) => go({ periode: e.target.value as FinancePeriode })}>
                {FINANCE_PERIODES.map((p) => <option key={p} value={p}>{fl.periode(p)}</option>)}
              </select>
              <ChevronRight aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-night-700" />
            </div>
          </div>
          {filters.periode === 'perso' && (
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
              <div>
                <label htmlFor={`${uid}-du`} className="mb-1.5 block text-[12px] font-bold text-night-900">{t('from')}</label>
                <input id={`${uid}-du`} type="date" className={selectCls} value={filters.du ?? range.fromDay} max={today} onChange={(e) => e.target.value && go({ du: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`${uid}-au`} className="mb-1.5 block text-[12px] font-bold text-night-900">{t('to')}</label>
                <input id={`${uid}-au`} type="date" className={selectCls} value={filters.au ?? range.toDay} max={today} onChange={(e) => e.target.value && go({ au: e.target.value })} />
              </div>
            </div>
          )}
          {filters.periode === 'mois' && (
            <div className="flex w-full items-center justify-between gap-2 sm:flex-1">
              <Link href={href({ mois: prev })} replace scroll={false} className={cn(navBtn, 'hover:bg-night-50')} aria-label={t('prevMonth', { month: fmtMonthYear(parseDay(`${prev}-01`), loc) })}>
                <ChevronLeft aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </Link>
              <p className="text-center text-[14px] font-bold capitalize text-night-900">{label}</p>
              {canNext ? (
                <Link href={href({ mois: next })} replace scroll={false} className={cn(navBtn, 'hover:bg-night-50')} aria-label={t('nextMonth', { month: fmtMonthYear(parseDay(`${next}-01`), loc) })}>
                  <ChevronRight aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </Link>
              ) : (
                <span aria-hidden="true" className={cn(navBtn, 'cursor-not-allowed text-night-300')}>
                  <ChevronRight className="h-5 w-5" strokeWidth={1.8} />
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Mention obligatoire : toujours visible, quel que soit l'état (chargement, erreur, vide). */}
      <FinancesNotice />

      {/* Filtres */}
      <details open={nFilters > 0 || undefined} className="group rounded-2xl border border-night-100 bg-white">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2.5 rounded-2xl px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <Filter aria-hidden="true" className="h-4 w-4 text-leaf-600" strokeWidth={2} />
          <span className="flex-1 text-[13px] font-bold text-night-900">
            {t('filters')}
            {nFilters > 0 && <span className="ml-2 rounded-full bg-leaf-50 px-2 py-0.5 text-[11px] font-semibold text-leaf-700">{t('activeCount', { count: nFilters })}</span>}
          </span>
          <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700 group-open:rotate-90 motion-safe:transition-transform" />
        </summary>
        <div className="grid gap-3 border-t border-night-100 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id={`${uid}-sens`} label={t('direction')} value={filters.sens ?? ''} options={sensOptions} onChange={(v) => go({ sens: (v || undefined) as FinanceFilters['sens'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-statut`} label={t('status')} value={filters.statut ?? ''} options={statutOptions} onChange={(v) => go({ statut: (v || undefined) as FinanceFilters['statut'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-cat`} label={t('category')} value={filters.categorie ?? ''} options={categoryOptions} onChange={(v) => go({ categorie: (v || undefined) as FinanceFilters['categorie'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-enfant`} label={t('child')} value={filters.enfant ?? ''} options={childFilterOptions} onChange={(v) => go({ enfant: v || undefined })} cls={selectCls} />
          {nFilters > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Link
                href={href({ sens: undefined, statut: undefined, categorie: undefined, enfant: undefined })}
                replace
                scroll={false}
                className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-leaf-700 underline underline-offset-2 hover:text-leaf-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                {t('clearFilters')}
              </Link>
            </div>
          )}
        </div>
      </details>

      {/* Totaux */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-labelledby={`${uid}-tot`} aria-busy={pending} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
          <h2 id={`${uid}-tot`} className="text-[13px] font-bold text-night-900">
            {filters.periode === 'mois' ? t('totalsMonth') : t('totalsPeriod')}
            <span className="block text-[11px] font-normal text-night-600">{periodLabel}{nFilters > 0 ? ` · ${t('filtersApplied')}` : ''}</span>
          </h2>
          <div aria-live="polite" className="mt-3">
            {error ? (
              <p className="text-xs text-night-600">{t('totalsUnavailable')}</p>
            ) : pending ? (
              <p className="text-xs text-night-600">{t('computing')}</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <TotalTile label={t('spent')} value={formatTotals(flux.sortie)} />
                  <TotalTile label={t('received')} value={formatTotals(flux.entree)} />
                  <TotalTile label={t('balance')} value={formatSolde(flux.solde)} strong />
                </dl>
                <ul className="mt-3 space-y-1 text-[12px] text-night-700">
                  <li>{t('operationsCount', { count: items.length })}</li>
                  {flux.tiers.length > 0 && <li>{t('paidByThird')} <strong className="tabular-nums text-night-900">{formatTotals(flux.tiers)}</strong></li>}
                  {flux.aRegler.length > 0 && <li>{t('remainingToPay')} <strong className="tabular-nums text-night-900">{formatTotals(flux.aRegler)}</strong></li>}
                </ul>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby={`${uid}-enfants`} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
          <h2 id={`${uid}-enfants`} className="text-[13px] font-bold text-night-900">{t('byChild')}</h2>
          {error ? (
            <p className="mt-2 text-xs text-night-600">{t('totalsUnavailable')}</p>
          ) : pending || childrenLoading ? (
            <p aria-busy="true" className="mt-2 text-xs text-night-600">{t('loadingShort')}</p>
          ) : buckets.length === 0 ? (
            <p className="mt-2 text-xs text-night-600">{t('noOperationsPeriod')}</p>
          ) : (
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-night-600">
                  <th scope="col" className="py-1.5 font-semibold">{t('child')}</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">{t('spent')}</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">{t('received')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-100">
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className="max-w-[9rem] truncate py-2.5 pr-2 text-left font-semibold text-night-900">
                      {b.key === '__plusieurs' ? t('severalChildren') : b.key === '__aucun' ? t('noChild') : b.label}<span className="ml-1 font-normal text-night-600">({b.count})</span>
                    </th>
                    <td className="py-2.5 text-right font-bold tabular-nums text-night-900">{formatTotals(b.sortie)}</td>
                    <td className="py-2.5 pl-2 text-right font-bold tabular-nums text-night-900">{formatTotals(b.entree)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!pending && !childrenLoading && buckets.some((b) => b.key === '__plusieurs') && (
            <p className="mt-1 text-[11px] leading-snug text-night-600">{t('severalChildrenNote')}</p>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-night-900">
          {filters.periode === 'mois' ? t('operationsMonth', { deMonth: deMonth(label.toLowerCase()), month: label }) : t('operationsPeriod')}
        </h2>
        <Link
          href="/app/journal/nouveau?type=depense"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-leaf-500 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 motion-safe:active:scale-[.98]"
        >
          <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          {t('add')}
          <span className="sr-only"> {t('addSr')}</span>
        </Link>
      </div>

      {error ? (
        <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} />
      ) : pending ? (
        <LoadingState compact title={t('loadingOperations')} description="" />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<Wallet className="h-9 w-9" strokeWidth={1.6} />}
          title={nFilters > 0 ? t('emptyFiltersTitle') : t('emptyPeriodTitle')}
          description={nFilters > 0 ? t('emptyFiltersText') : t('emptyPeriodText')}
          primary={nFilters > 0
            ? { label: t('clearFilters'), href: href({ sens: undefined, statut: undefined, categorie: undefined, enfant: undefined }) }
            : { label: t('addExpense'), href: '/app/journal/nouveau?type=depense' }}
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => {
            const d = e.depense!
            const day = parseDay(e.date)
            const kids = names(e.childIds)
            const f = fluxOf(d)
            const s = sensOf(d)
            const st = statutOf(d)
            const rec = recurrenceOf(d)
            const nJustifs = allJustificatifs(d).length
            const sign = f === 'entree' ? '+' : f === 'sortie' ? '−' : ''
            // Montant affiché = montant réglé (comme les totaux) ; le reste dû est précisé dessous.
            const regle = montantRegleCents(d)
            const reste = resteDuCents(d)
            return (
              <li key={e.id}>
                <Link
                  href={`/app/journal/${e.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white py-3.5 pl-4 pr-3 shadow-soft transition-colors hover:bg-night-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
                >
                  <span className="w-9 shrink-0 self-start text-center leading-none text-teal-700">
                    <span className="block text-xl font-extrabold tabular-nums">{String(day.getUTCDate()).padStart(2, '0')}</span>
                    <span className="mt-1 block text-[10px] font-bold tracking-wide">{fmtMonthShort(day, loc)}</span>
                    <span className="sr-only"> {day.getUTCFullYear()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-night-900">{e.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-night-700">
                      {s !== 'depense' && (
                        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold', f === 'entree' ? 'bg-leaf-50 text-leaf-800' : 'bg-night-50 text-night-800')}>
                          {f === 'entree'
                            ? <ArrowDownLeft aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
                            : <ArrowUpRight aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />}
                          {fl.sens(s)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800">
                        <ReceiptText aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                        {fl.category(d.categorie)}
                      </span>
                      <StatutBadge statut={st} />
                      {kids && <span className="truncate">{kids}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-night-600">
                      <span className="inline-flex items-center gap-1">
                        {nJustifs ? (
                          <><Paperclip aria-hidden="true" className="h-3 w-3" strokeWidth={2} />{nJustifs > 1 ? t('receiptsCount', { count: nJustifs }) : t('receiptAttached')}</>
                        ) : (
                          t('noReceipt')
                        )}
                      </span>
                      {rec !== 'ponctuel' && (
                        <span className="inline-flex items-center gap-1">
                          <Repeat aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                          {fl.recurrence(rec)}
                          {d.echeanceSuivante && <>{t('nextDue', { date: fmtDayKey(d.echeanceSuivante, { day: 'numeric', month: 'short' }) })}</>}
                        </span>
                      )}
                      {f === 'tiers' && <span>{t('paidByThirdShort')}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('block text-[14px] font-extrabold tabular-nums', f === 'entree' ? 'text-leaf-700' : 'text-night-900')}>
                      <span className="sr-only">{f === 'entree' ? t('fluxIn') : f === 'sortie' ? t('fluxOut') : t('fluxThird')}{reste > 0 ? t('amountPaidSr') : ''} : </span>
                      {regle > 0 && <span aria-hidden="true">{sign}</span>}
                      {formatMontant(regle, d.devise)}
                    </span>
                    {reste > 0 && (
                      <span className="mt-0.5 block max-w-[6.5rem] text-[11px] font-semibold leading-snug text-night-700">
                        <span className="sr-only">{t('outOfSr', { total: formatMontant(d.montantCents, d.devise) })} </span>{t('ofWhichToPay', { value: formatMontant(reste, d.devise) })}
                      </span>
                    )}
                  </span>
                  <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TotalTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-xl px-1.5 py-2.5', strong ? 'bg-leaf-50' : 'bg-night-50/60')}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-night-600">{label}</dt>
      <dd className="mt-1 break-words text-[15px] font-extrabold leading-tight tabular-nums text-night-900 sm:text-[17px]">{value}</dd>
    </div>
  )
}

function FilterSelect({ id, label, value, options, onChange, cls }: {
  id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; cls: string
}) {
  const t = useTranslations('family.finances.view')
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-bold text-night-900">{label}</label>
      <div className="relative">
        <select id={id} className={cn(cls, 'pr-9')} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('all')}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronRight aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-night-700" />
      </div>
    </div>
  )
}
