'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarDays, CheckCircle2, ChevronRight, NotebookPen, Plus } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { JOURNAL_TYPES } from '@/components/journal/journalTypes'
import { JournalFilters } from '@/components/journal/JournalFilters'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { FinancesView } from '@/components/journal/FinancesView'
import { fmtMonthShort, fmtPlage, parseDay } from '@/components/journal/journalData'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useJournalList } from '@/lib/data/journal'
import { useChildOptions } from '@/lib/data/children'
import { dayKeyInTz, monthKeyInTz } from '@/lib/tz'
import {
  FILTER_TYPE, fluxOf, isMonthKey, parseFinanceFilters, parseJournalFilter,
} from '@/lib/journal-finances'
import { cn } from '@/lib/cn'

type Search = Record<string, string | string[] | undefined>

// M05 — Journal (liste) + filtres (`?filtre=`) + vue Finances (`?filtre=finances&mois=yyyy-mm`,
// + `periode`, `du`, `au`, `sens`, `statut`, `categorie`, `enfant` : voir parseFinanceFilters).
// RLS Supabase : journal_entries (+ journal_expenses) filtrés par user_id.
export default function JournalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const t = useTranslations('family.journal.list')
  const fl = useFinanceLabels()
  const sp = use(searchParams)
  const filter = parseJournalFilter(sp.filtre)
  const moisParam = Array.isArray(sp.mois) ? sp.mois[0] : sp.mois
  const type = FILTER_TYPE[filter]
  const tSaved = useTranslations('family.journal.entryForm')
  const router = useRouter()
  const pathname = usePathname()
  // Confirmation après un ajout (`?ok=depense|evenement`, posé par /app/journal/nouveau) :
  // affichée une fois, puis le paramètre est retiré de l'URL (pas de message à chaque rechargement).
  const okParam = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok
  const [savedKind, setSavedKind] = useState<'depense' | 'evenement' | null>(null)
  useEffect(() => {
    if (okParam !== 'depense' && okParam !== 'evenement') return
    setSavedKind(okParam)
    const rest = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (k !== 'ok' && typeof v === 'string') rest.set(k, v)
    const qs = rest.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [okParam, sp, pathname, router])

  const { data, loading, error, refresh } = useJournalList()
  const { options: childOptions, loading: childrenLoading } = useChildOptions()
  const now = useClientNow()

  const filtered = useMemo(() => (data ?? []).filter((e) => !type || e.type === type), [data, type])
  const recents = filtered.slice(0, 20)

  // Mois courant dans le fuseau de l'utilisateur (même clé que les dépenses et le Coach IA).
  const currentMonth = now ? monthKeyInTz(now) : null
  const today = now ? dayKeyInTz(now) : null
  const financeFilters = useMemo(() => parseFinanceFilters(sp), [sp])
  const month = isMonthKey(moisParam) && (!currentMonth || moisParam <= currentMonth) ? moisParam : currentMonth

  return (
    <div className="px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
      <header className="flex h-12 items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight text-night-900">{t('title')}</h1>
        <Link
          href={filter === 'finances' ? '/app/journal/nouveau?type=depense' : '/app/journal/nouveau'}
          aria-label={filter === 'finances' ? t('addExpenseAria') : t('addEventAria')}
          className="grid h-11 w-11 place-items-center rounded-full border border-night-100 bg-white text-night-900 shadow-soft transition-colors hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
        </Link>
      </header>

      {savedKind && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-leaf-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-leaf-800 ring-1 ring-leaf-200">
          <CheckCircle2 aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-leaf-600" />
          {savedKind === 'depense' ? tSaved('doneExpenseHeading') : tSaved('doneEventHeading')}
        </p>
      )}

      <Link
        href={filter === 'tous' ? '/app/journal/chronologie' : `/app/journal/chronologie?filtre=${filter}`}
        className="mt-4 flex items-center gap-3.5 rounded-2xl border border-night-100 bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40"
      >
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
          <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-night-900">{t('timelineView')}</span>
          <span className="block text-xs text-night-600">
            {filter === 'tous' ? t('allEvents') : t('filterLabel', { filter: fl.filter(filter) })}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] text-night-700" />
      </Link>

      <JournalFilters basePath="/app/journal" value={filter} className="mt-4" />

      {filter !== 'finances' && (
        <h2 className="mb-3 mt-5 text-[15px] font-bold text-night-900">
          {filter === 'tous' ? t('recent') : t('recentFiltered', { filter: fl.filter(filter) })}
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
            <LoadingState compact title={t('loadingFinances')} description="" />
          )
        ) : loading && !data ? (
          <LoadingState compact title={t('loading')} description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backHome'), href: '/app' }} />
        ) : recents.length === 0 ? (
          <EmptyState
            icon={<NotebookPen className="h-9 w-9" strokeWidth={1.6} />}
            title={filter === 'tous' ? t('emptyTitle') : t('emptyFilterTitle')}
            description={t('emptyText')}
            primary={{ label: t('addEvent'), href: '/app/journal/nouveau' }}
            compact
          />
        ) : (
          <ul className="space-y-2.5">
            {recents.map((e) => {
              const day = parseDay(e.date)
              const cfg = JOURNAL_TYPES[e.type]
              const plage = fmtPlage(e, fl.locale)
              return (
                <li key={e.id}>
                  <Link
                    href={`/app/journal/${e.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-night-100 bg-white py-3.5 pl-4 pr-3 shadow-soft transition-colors hover:bg-night-50/40"
                  >
                    <span className={cn('w-9 shrink-0 self-start text-center leading-none', cfg.dayColor)}>
                      <span className="block text-xl font-extrabold tabular-nums">{String(day.getUTCDate()).padStart(2, '0')}</span>
                      <span className="mt-1 block text-[10px] font-bold tracking-wide">{fmtMonthShort(day, fl.locale)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dot)} />
                        <span className="truncate text-[13px] font-bold text-night-900">{e.title}</span>
                        <span className="sr-only">({fl.type(e.type)})</span>
                      </span>
                      {e.depense ? (
                        <span className="mt-1 block pl-4 text-xs font-semibold tabular-nums text-night-800">
                          {fluxOf(e.depense) === 'entree' && <span className="text-leaf-700">+</span>}
                          {fl.money(e.depense.montantCents, e.depense.devise)}
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
