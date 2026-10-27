'use client'

import { use, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Filter, Search, X } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { Fab } from '@/components/journal/Fab'
import { TimelineEvent } from '@/components/journal/TimelineEvent'
import { JournalFilters, journalFilterHref } from '@/components/journal/JournalFilters'
import { fmtMonthYear, parseDay } from '@/components/journal/journalData'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { useJournalList } from '@/lib/data/journal'
import {
  DEPENSE_CATEGORIE_LABELS, FILTER_TYPE, JOURNAL_FILTERS, parseJournalFilter,
} from '@/lib/journal-finances'
import { cn } from '@/lib/cn'

// M05 — Chronologie groupée par mois + filtres (dans l'URL : `?filtre=`).
const BASE = '/app/journal/chronologie'

export default function ChronologiePage({ searchParams }: { searchParams: Promise<{ filtre?: string | string[] }> }) {
  const t = useTranslations('family.journal.timeline')
  const fl = useFinanceLabels()
  const filter = parseJournalFilter(use(searchParams).filtre)
  const type = FILTER_TYPE[filter]
  const router = useRouter()
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data, loading, error, refresh } = useJournalList()
  const all = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((e) => !type || e.type === type)
      .filter((e) =>
        !needle ||
        e.title.toLowerCase().includes(needle) ||
        (e.description ?? '').toLowerCase().includes(needle) ||
        (e.lieu ?? '').toLowerCase().includes(needle) ||
        (e.depense
          ? DEPENSE_CATEGORIE_LABELS[e.depense.categorie].toLowerCase().includes(needle) ||
            fl.category(e.depense.categorie).toLowerCase().includes(needle)
          : false),
      )
  }, [all, type, q, fl])

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const e of filtered) {
      const key = e.date.slice(0, 7)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return Array.from(map.entries())
  }, [filtered])

  const toggleSearch = () => {
    setSearchOpen((o) => {
      if (o) setQ('')
      else requestAnimationFrame(() => searchRef.current?.focus())
      return !o
    })
  }

  const iconBtn = 'grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50'

  return (
    <>
      <TopBar
        title={t('title')}
        showBack
        backHref="/app/journal"
        showBell={false}
        rightSlot={
          <span className="-mr-2 flex">
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-label={t('filterByType')}
              aria-haspopup="dialog"
              className={cn(iconBtn, filter !== 'tous' && 'text-leaf-600')}
            >
              <Filter aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={searchOpen ? t('closeSearch') : t('search')}
              aria-expanded={searchOpen}
              aria-controls="journal-search"
              className={iconBtn}
            >
              {searchOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Search aria-hidden="true" className="h-5 w-5" />}
            </button>
          </span>
        }
      />

      <div className="px-4 pb-6 pt-2">
        <div id="journal-search" hidden={!searchOpen} className="mb-3">
          <label htmlFor="journal-q" className="sr-only">{t('searchLabel')}</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-night-500" />
            <input
              ref={searchRef}
              id="journal-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-11 w-full rounded-xl border border-night-100 bg-white pl-10 pr-4 text-[13px] text-night-900 placeholder:text-night-400 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500/20"
            />
          </div>
        </div>

        <JournalFilters basePath={BASE} value={filter} />

        <div aria-live="polite" className="sr-only">
          {t('count', { count: filtered.length })}
        </div>

        {loading && !data ? (
          <LoadingState compact title={t('loading')} description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToJournal'), href: '/app/journal' }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title={t('noResults')}
            description={q ? t('noResultsQuery') : t('noResultsFilter')}
            primary={filter === 'finances'
              ? { label: t('addExpense'), href: '/app/journal/nouveau?type=depense' }
              : { label: t('addEvent'), href: '/app/journal/nouveau' }}
          />
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map(([monthKey, entries]) => (
              <section key={monthKey} aria-labelledby={`m-${monthKey}`}>
                <h2 id={`m-${monthKey}`} className="rounded-lg bg-night-50/70 px-3 py-2 text-xs font-bold text-night-900">
                  {fmtMonthYear(parseDay(`${monthKey}-01`), fl.locale)}
                </h2>
                <ul className="mt-3">
                  {entries.map((e, i) => (
                    <TimelineEvent key={e.id} entry={e} isLast={i === entries.length - 1} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <Fab
        href={filter === 'finances' ? '/app/journal/nouveau?type=depense' : '/app/journal/nouveau'}
        label={filter === 'finances' ? t('addExpense') : t('addEvent')}
      />

      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t('filterByType')}
        actions={JOURNAL_FILTERS.map((f) => ({
          key: f,
          label: filter === f ? t('activeFilter', { filter: fl.filter(f) }) : fl.filter(f),
          onClick: () => { router.replace(journalFilterHref(BASE, f), { scroll: false }); setSheet(false) },
        }))}
      />
    </>
  )
}
