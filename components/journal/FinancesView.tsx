'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Filter, Info, Paperclip, Plus, ReceiptText, Repeat, Wallet,
} from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { deMonth, fmtMonthShort, fmtMonthYear, parseDay } from '@/components/journal/journalData'
import { cn } from '@/lib/cn'
import {
  DEPENSE_CATEGORIES, DEPENSE_CATEGORIE_LABELS, DEPENSE_SENS, DEPENSE_SENS_LABELS, DEPENSE_STATUTS, DEPENSE_STATUT_LABELS,
  FINANCES_DISCLAIMER, FINANCE_PERIODES, FINANCE_PERIODE_LABELS, RECURRENCE_LABELS,
  activeFilterCount, allJustificatifs, applyFinanceFilters, financeRange, fluxOf, formatMontant, formatSolde, formatTotals,
  montantRegleCents, recurrenceOf, resteDuCents, sensOf, shiftMonth, statutOf, totalsByChild, totalsByFlux,
  type DepenseStatut, type FinanceFilters, type FinancePeriode,
} from '@/lib/journal-finances'
import { fmtDayKey } from '@/lib/tz'
import { useExpensesInRange } from '@/lib/data/journal'

/** Mention obligatoire : affichée sur la vue Finances, le formulaire et le détail d'une dépense. */
export function FinancesNotice({ className }: { className?: string }) {
  return (
    <p className={cn('flex gap-2.5 rounded-xl border border-night-100 bg-night-50/60 px-3.5 py-3 text-[12px] leading-relaxed text-night-700', className)}>
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-night-700" strokeWidth={1.8} />
      <span>{FINANCES_DISCLAIMER}</span>
    </p>
  )
}

/** Pastille de statut (texte toujours présent : la couleur n'est jamais seule porteuse de sens). */
export function StatutBadge({ statut, className }: { statut: DepenseStatut; className?: string }) {
  if (statut === 'paye') return null
  const tone: Record<Exclude<DepenseStatut, 'paye'>, string> = {
    'en-attente': 'bg-night-50 text-night-800 ring-night-200',
    partiel: 'bg-night-50 text-night-800 ring-night-200',
    rembourse: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
    conteste: 'bg-alert-50 text-alert-700 ring-alert-200',
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tone[statut], className)}>
      {DEPENSE_STATUT_LABELS[statut]}
    </span>
  )
}

type ChildOpt = { id: string; prenom: string }

const SENS_OPTIONS = DEPENSE_SENS.map((s) => ({ value: s, label: DEPENSE_SENS_LABELS[s] }))
const STATUT_OPTIONS = DEPENSE_STATUTS.map((s) => ({ value: s, label: DEPENSE_STATUT_LABELS[s] }))
const CATEGORY_OPTIONS = DEPENSE_CATEGORIES.map((c) => ({ value: c, label: DEPENSE_CATEGORIE_LABELS[c] }))

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
  /** Mois courant "yyyy-mm" dans DEFAULT_TZ (borne de « mois suivant ») */
  currentMonth: string
  /** Jour courant "yyyy-mm-dd" dans DEFAULT_TZ */
  today: string
  filters: FinanceFilters
  basePath: string
}) {
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

  const label = fmtMonthYear(parseDay(`${month}-01`))
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const canNext = next <= currentMonth
  const periodLabel = filters.periode === 'mois'
    ? label
    : `Du ${fmtDayKey(range.fromDay, { day: 'numeric', month: 'short', year: 'numeric' })} au ${fmtDayKey(range.toDay, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const names = (ids: string[]) => childOptions.filter((c) => ids.includes(c.id)).map((c) => c.prenom).join(', ')

  const navBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-night-100 bg-white text-night-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'
  const selectCls = 'block h-11 w-full appearance-none rounded-xl border border-night-100 bg-white px-3.5 text-[13px] text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500/20'
  const childFilterOptions = [...childOptions.map((c) => ({ value: c.id, label: c.prenom })), { value: '__aucun', label: 'Sans enfant précisé' }]

  return (
    <div className="space-y-4">
      {/* Période */}
      <section aria-labelledby={`${uid}-periode`} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <label id={`${uid}-periode`} htmlFor={`${uid}-p`} className="mb-1.5 block text-[12px] font-bold text-night-900">Période</label>
            <div className="relative">
              <select id={`${uid}-p`} className={cn(selectCls, 'pr-9')} value={filters.periode} onChange={(e) => go({ periode: e.target.value as FinancePeriode })}>
                {FINANCE_PERIODES.map((p) => <option key={p} value={p}>{FINANCE_PERIODE_LABELS[p]}</option>)}
              </select>
              <ChevronRight aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-night-700" />
            </div>
          </div>
          {filters.periode === 'perso' && (
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
              <div>
                <label htmlFor={`${uid}-du`} className="mb-1.5 block text-[12px] font-bold text-night-900">Du</label>
                <input id={`${uid}-du`} type="date" className={selectCls} value={filters.du ?? range.fromDay} max={today} onChange={(e) => e.target.value && go({ du: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`${uid}-au`} className="mb-1.5 block text-[12px] font-bold text-night-900">Au</label>
                <input id={`${uid}-au`} type="date" className={selectCls} value={filters.au ?? range.toDay} max={today} onChange={(e) => e.target.value && go({ au: e.target.value })} />
              </div>
            </div>
          )}
          {filters.periode === 'mois' && (
            <div className="flex w-full items-center justify-between gap-2 sm:flex-1">
              <Link href={href({ mois: prev })} replace scroll={false} className={cn(navBtn, 'hover:bg-night-50')} aria-label={`Mois précédent : ${fmtMonthYear(parseDay(`${prev}-01`))}`}>
                <ChevronLeft aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </Link>
              <p className="text-center text-[14px] font-bold capitalize text-night-900">{label}</p>
              {canNext ? (
                <Link href={href({ mois: next })} replace scroll={false} className={cn(navBtn, 'hover:bg-night-50')} aria-label={`Mois suivant : ${fmtMonthYear(parseDay(`${next}-01`))}`}>
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
            Filtres
            {nFilters > 0 && <span className="ml-2 rounded-full bg-leaf-50 px-2 py-0.5 text-[11px] font-semibold text-leaf-700">{nFilters} actif{nFilters > 1 ? 's' : ''}</span>}
          </span>
          <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700 group-open:rotate-90 motion-safe:transition-transform" />
        </summary>
        <div className="grid gap-3 border-t border-night-100 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id={`${uid}-sens`} label="Sens" value={filters.sens ?? ''} options={SENS_OPTIONS} onChange={(v) => go({ sens: (v || undefined) as FinanceFilters['sens'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-statut`} label="Statut" value={filters.statut ?? ''} options={STATUT_OPTIONS} onChange={(v) => go({ statut: (v || undefined) as FinanceFilters['statut'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-cat`} label="Catégorie" value={filters.categorie ?? ''} options={CATEGORY_OPTIONS} onChange={(v) => go({ categorie: (v || undefined) as FinanceFilters['categorie'] })} cls={selectCls} />
          <FilterSelect id={`${uid}-enfant`} label="Enfant" value={filters.enfant ?? ''} options={childFilterOptions} onChange={(v) => go({ enfant: v || undefined })} cls={selectCls} />
          {nFilters > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Link
                href={href({ sens: undefined, statut: undefined, categorie: undefined, enfant: undefined })}
                replace
                scroll={false}
                className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-leaf-700 underline underline-offset-2 hover:text-leaf-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                Effacer les filtres
              </Link>
            </div>
          )}
        </div>
      </details>

      {/* Totaux */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-labelledby={`${uid}-tot`} aria-busy={pending} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
          <h2 id={`${uid}-tot`} className="text-[13px] font-bold text-night-900">
            {filters.periode === 'mois' ? 'Totaux du mois' : 'Totaux de la période'}
            <span className="block text-[11px] font-normal text-night-600">{periodLabel}{nFilters > 0 ? ' · filtres appliqués' : ''}</span>
          </h2>
          <div aria-live="polite" className="mt-3">
            {error ? (
              <p className="text-xs text-night-600">Totaux indisponibles.</p>
            ) : pending ? (
              <p className="text-xs text-night-600">Calcul des totaux…</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <TotalTile label="Dépensé" value={formatTotals(flux.sortie)} />
                  <TotalTile label="Reçu" value={formatTotals(flux.entree)} />
                  <TotalTile label="Solde" value={formatSolde(flux.solde)} strong />
                </dl>
                <ul className="mt-3 space-y-1 text-[12px] text-night-700">
                  <li>{items.length} opération{items.length > 1 ? 's' : ''} enregistrée{items.length > 1 ? 's' : ''}</li>
                  {flux.tiers.length > 0 && <li>Réglé par l’autre parent ou un tiers (hors solde) : <strong className="tabular-nums text-night-900">{formatTotals(flux.tiers)}</strong></li>}
                  {flux.aRegler.length > 0 && <li>Reste à régler (en attente, partiel) : <strong className="tabular-nums text-night-900">{formatTotals(flux.aRegler)}</strong></li>}
                </ul>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby={`${uid}-enfants`} className="rounded-2xl border border-night-100 bg-white p-4 shadow-soft">
          <h2 id={`${uid}-enfants`} className="text-[13px] font-bold text-night-900">Par enfant</h2>
          {error ? (
            <p className="mt-2 text-xs text-night-600">Totaux indisponibles.</p>
          ) : pending || childrenLoading ? (
            <p aria-busy="true" className="mt-2 text-xs text-night-600">Chargement…</p>
          ) : buckets.length === 0 ? (
            <p className="mt-2 text-xs text-night-600">Aucune opération sur cette période.</p>
          ) : (
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-night-600">
                  <th scope="col" className="py-1.5 font-semibold">Enfant</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Dépensé</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Reçu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-100">
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className="max-w-[9rem] truncate py-2.5 pr-2 text-left font-semibold text-night-900">
                      {b.label}<span className="ml-1 font-normal text-night-600">({b.count})</span>
                    </th>
                    <td className="py-2.5 text-right font-bold tabular-nums text-night-900">{formatTotals(b.sortie)}</td>
                    <td className="py-2.5 pl-2 text-right font-bold tabular-nums text-night-900">{formatTotals(b.entree)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!pending && !childrenLoading && buckets.some((b) => b.key === '__plusieurs') && (
            <p className="mt-1 text-[11px] leading-snug text-night-600">Une opération commune à plusieurs enfants est comptée une seule fois, sous « Plusieurs enfants ».</p>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-night-900">
          {filters.periode === 'mois' ? `Opérations ${deMonth(label.toLowerCase())}` : 'Opérations de la période'}
        </h2>
        <Link
          href="/app/journal/nouveau?type=depense"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-leaf-500 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 motion-safe:active:scale-[.98]"
        >
          <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          Ajouter
          <span className="sr-only"> une dépense ou un paiement</span>
        </Link>
      </div>

      {error ? (
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} />
      ) : pending ? (
        <LoadingState compact title="Chargement des opérations" description="" />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<Wallet className="h-9 w-9" strokeWidth={1.6} />}
          title={nFilters > 0 ? 'Aucune opération pour ces filtres' : 'Aucune opération sur cette période'}
          description={nFilters > 0 ? 'Modifiez ou effacez les filtres pour voir plus d’opérations.' : 'Enregistrez une dépense ou un paiement et joignez son justificatif pour retrouver l’historique.'}
          primary={nFilters > 0
            ? { label: 'Effacer les filtres', href: href({ sens: undefined, statut: undefined, categorie: undefined, enfant: undefined }) }
            : { label: 'Ajouter une dépense', href: '/app/journal/nouveau?type=depense' }}
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
                    <span className="mt-1 block text-[10px] font-bold tracking-wide">{fmtMonthShort(day)}</span>
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
                          {DEPENSE_SENS_LABELS[s]}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800">
                        <ReceiptText aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                        {DEPENSE_CATEGORIE_LABELS[d.categorie]}
                      </span>
                      <StatutBadge statut={st} />
                      {kids && <span className="truncate">{kids}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-night-600">
                      <span className="inline-flex items-center gap-1">
                        {nJustifs ? (
                          <><Paperclip aria-hidden="true" className="h-3 w-3" strokeWidth={2} />{nJustifs > 1 ? `${nJustifs} justificatifs` : 'Justificatif joint'}</>
                        ) : (
                          'Sans justificatif'
                        )}
                      </span>
                      {rec !== 'ponctuel' && (
                        <span className="inline-flex items-center gap-1">
                          <Repeat aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                          {RECURRENCE_LABELS[rec]}
                          {d.echeanceSuivante && <>, prochaine échéance le {fmtDayKey(d.echeanceSuivante, { day: 'numeric', month: 'short' })}</>}
                        </span>
                      )}
                      {f === 'tiers' && <span>Réglé par un tiers</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('block text-[14px] font-extrabold tabular-nums', f === 'entree' ? 'text-leaf-700' : 'text-night-900')}>
                      <span className="sr-only">{f === 'entree' ? 'Entrée' : f === 'sortie' ? 'Sortie' : 'Hors solde'}{reste > 0 ? ', montant réglé' : ''} : </span>
                      {regle > 0 && <span aria-hidden="true">{sign}</span>}
                      {formatMontant(regle, d.devise)}
                    </span>
                    {reste > 0 && (
                      <span className="mt-0.5 block max-w-[6.5rem] text-[11px] font-semibold leading-snug text-night-700">
                        <span className="sr-only">sur {formatMontant(d.montantCents, d.devise)}, </span>dont {formatMontant(reste, d.devise)} à régler
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
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-bold text-night-900">{label}</label>
      <div className="relative">
        <select id={id} className={cn(cls, 'pr-9')} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Tous</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronRight aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-night-700" />
      </div>
    </div>
  )
}
