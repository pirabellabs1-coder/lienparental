'use client'

import Link from 'next/link'
import { use, useMemo } from 'react'
import { CalendarDays, ChevronRight, NotebookPen, Plus } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { JOURNAL_TYPES } from '@/components/journal/journalTypes'
import { JournalFilters } from '@/components/journal/JournalFilters'
import { FinancesView } from '@/components/journal/FinancesView'
import { fmtMonthShort, fmtPlage, parseDay } from '@/components/journal/journalData'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useJournalList } from '@/lib/data/journal'
import { useChildOptions } from '@/lib/data/children'
import { dayKeyInTz, monthKeyInTz } from '@/lib/tz'
import {
  FILTER_TYPE, JOURNAL_FILTER_LABELS, fluxOf, formatMontant, isMonthKey, parseFinanceFilters, parseJournalFilter,
} from '@/lib/journal-finances'
import { cn } from '@/lib/cn'

type Search = Record<string, string | string[] | undefined>

// M05 — Journal (liste) + filtres (`?filtre=`) + vue Finances (`?filtre=finances&mois=yyyy-mm`,
// + `periode`, `du`, `au`, `sens`, `statut`, `categorie`, `enfant` : voir parseFinanceFilters).
// RLS Supabase : journal_entries (+ journal_expenses) filtrés par user_id.
export default function JournalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = use(searchParams)
  const filter = parseJournalFilter(sp.filtre)
  const moisParam = Array.isArray(sp.mois) ? sp.mois[0] : sp.mois
  const type = FILTER_TYPE[filter]

  const { data, loading, error, refresh } = useJournalList()
  const { options: childOptions, loading: childrenLoading } = useChildOptions()
  const now = useClientNow()

  const filtered = useMemo(() => (data ?? []).filter((e) => !type || e.type === type), [data, type])
  const recents = filtered.slice(0, 20)

  // Mois courant dans DEFAULT_TZ (même clé que les dépenses et le Coach IA).
  const currentMonth = now ? monthKeyInTz(now) : null
  const today = now ? dayKeyInTz(now) : null
  const financeFilters = useMemo(() => parseFinanceFilters(sp), [sp])
  const month = isMonthKey(moisParam) && (!currentMonth || moisParam <= currentMonth) ? moisParam : currentMonth

  return (
    <div className="px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <header className="flex h-12 items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight text-night-900">Journal</h1>
        <Link
          href={filter === 'finances' ? '/app/journal/nouveau?type=depense' : '/app/journal/nouveau'}
          aria-label={filter === 'finances' ? 'Ajouter une dépense au journal' : 'Ajouter un événement au journal'}
          className="grid h-11 w-11 place-items-center rounded-full border border-night-100 bg-white text-night-900 shadow-soft transition-colors hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
        </Link>
      </header>

      <Link
        href={filter === 'tous' ? '/app/journal/chronologie' : `/app/journal/chronologie?filtre=${filter}`}
        className="mt-4 flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40"
      >
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
          <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-night-900">Vue chronologique</span>
          <span className="block text-xs text-night-600">
            {filter === 'tous' ? 'Tous les événements' : `Filtre : ${JOURNAL_FILTER_LABELS[filter]}`}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700" />
      </Link>

      <JournalFilters basePath="/app/journal" value={filter} className="mt-4" />

      {filter !== 'finances' && (
        <h2 className="mb-3 mt-5 text-[15px] font-bold text-night-900">
          {filter === 'tous' ? 'Événements récents' : `Événements récents · ${JOURNAL_FILTER_LABELS[filter]}`}
        </h2>
      )}

      <div className={filter === 'finances' ? 'mt-4' : undefined}>
        {filter === 'finances' ? (
          // Vue Finances : lecture dédiée des dépenses du mois (indépendante de la liste tronquée).
          month && currentMonth && today ? (
            <FinancesView
              childOptions={childOptions}
              childrenLoading={childrenLoading}
              month={month}
              currentMonth={currentMonth}
              today={today}
              filters={financeFilters}
              basePath="/app/journal"
            />
          ) : (
            <LoadingState compact title="Chargement des finances" description="" />
          )
        ) : loading && !data ? (
          <LoadingState compact title="Chargement du journal" description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: "Retour à l'accueil", href: '/app' }} />
        ) : recents.length === 0 ? (
          <EmptyState
            icon={<NotebookPen className="h-9 w-9" strokeWidth={1.6} />}
            title={filter === 'tous' ? 'Aucun événement pour le moment' : 'Aucun événement pour ce filtre'}
            description="Consignez une visite, un appel, une dépense ou un rendez-vous : l'horodatage est automatique."
            primary={{ label: 'Ajouter un événement', href: '/app/journal/nouveau' }}
            compact
          />
        ) : (
          <ul className="space-y-2.5">
            {recents.map((e) => {
              const day = parseDay(e.date)
              const t = JOURNAL_TYPES[e.type]
              const plage = fmtPlage(e)
              return (
                <li key={e.id}>
                  <Link
                    href={`/app/journal/${e.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white py-3.5 pl-4 pr-3 shadow-soft transition-colors hover:bg-night-50/40"
                  >
                    <span className={cn('w-9 shrink-0 self-start text-center leading-none', t.dayColor)}>
                      <span className="block text-xl font-extrabold tabular-nums">{String(day.getUTCDate()).padStart(2, '0')}</span>
                      <span className="mt-1 block text-[10px] font-bold tracking-wide">{fmtMonthShort(day)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', t.dot)} />
                        <span className="truncate text-[13px] font-bold text-night-900">{e.title}</span>
                        <span className="sr-only">({t.label})</span>
                      </span>
                      {e.depense ? (
                        <span className="mt-1 block pl-4 text-xs font-semibold tabular-nums text-night-800">
                          {fluxOf(e.depense) === 'entree' && <span className="text-leaf-700">+</span>}
                          {formatMontant(e.depense.montantCents, e.depense.devise)}
                        </span>
                      ) : (
                        plage && <span className="mt-1 block pl-4 text-xs text-night-700 tabular-nums">{plage}</span>
                      )}
                      {e.description && (
                        <span className="mt-1 line-clamp-2 block pl-4 text-xs leading-relaxed text-night-600">{e.description}</span>
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
    </div>
  )
}
