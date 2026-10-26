'use client'

import { use, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, Search, X } from 'lucide-react'
import { ActionSheet } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { Fab } from '@/components/journal/Fab'
import { TimelineEvent } from '@/components/journal/TimelineEvent'
import { JournalFilters, journalFilterHref } from '@/components/journal/JournalFilters'
import { fmtMonthYear, parseDay } from '@/components/journal/journalData'
import { useJournalList } from '@/lib/data/journal'
import {
  DEPENSE_CATEGORIE_LABELS, FILTER_TYPE, JOURNAL_FILTERS, JOURNAL_FILTER_LABELS, parseJournalFilter,
} from '@/lib/journal-finances'
import { cn } from '@/lib/cn'

// M05 — Chronologie groupée par mois + filtres (dans l'URL : `?filtre=`).
const BASE = '/app/journal/chronologie'

export default function ChronologiePage({ searchParams }: { searchParams: Promise<{ filtre?: string | string[] }> }) {
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
        (e.depense ? DEPENSE_CATEGORIE_LABELS[e.depense.categorie].toLowerCase().includes(needle) : false),
      )
  }, [all, type, q])

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
        title="Chronologie"
        showBack
        backHref="/app/journal"
        showBell={false}
        rightSlot={
          <span className="-mr-2 flex">
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-label="Filtrer par type"
              aria-haspopup="dialog"
              className={cn(iconBtn, filter !== 'tous' && 'text-leaf-600')}
            >
              <Filter aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={searchOpen ? 'Fermer la recherche' : 'Rechercher'}
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
          <label htmlFor="journal-q" className="sr-only">Rechercher dans le journal</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-night-500" />
            <input
              ref={searchRef}
              id="journal-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un fait, un lieu…"
              className="h-11 w-full rounded-xl border border-night-100 bg-white pl-10 pr-4 text-[13px] text-night-900 placeholder:text-night-400 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500/20"
            />
          </div>
        </div>

        <JournalFilters basePath={BASE} value={filter} />

        <div aria-live="polite" className="sr-only">
          {filtered.length} événement{filtered.length > 1 ? 's' : ''}
        </div>

        {loading && !data ? (
          <LoadingState compact title="Chargement du journal" description="" />
        ) : error ? (
          <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: 'Retour au journal', href: '/app/journal' }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title="Aucun résultat"
            description={q ? 'Essayez un autre terme ou un autre filtre.' : 'Aucun événement pour ce filtre.'}
            primary={filter === 'finances'
              ? { label: 'Ajouter une dépense', href: '/app/journal/nouveau?type=depense' }
              : { label: 'Ajouter un événement', href: '/app/journal/nouveau' }}
          />
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map(([monthKey, entries]) => (
              <section key={monthKey} aria-labelledby={`m-${monthKey}`}>
                <h2 id={`m-${monthKey}`} className="rounded-lg bg-night-50/70 px-3 py-2 text-xs font-bold text-night-900">
                  {fmtMonthYear(parseDay(`${monthKey}-01`))}
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
        label={filter === 'finances' ? 'Ajouter une dépense' : 'Ajouter un événement'}
      />

      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filtrer par type"
        actions={JOURNAL_FILTERS.map((f) => ({
          key: f,
          label: filter === f ? `${JOURNAL_FILTER_LABELS[f]} (actif)` : JOURNAL_FILTER_LABELS[f],
          onClick: () => { router.replace(journalFilterHref(BASE, f), { scroll: false }); setSheet(false) },
        }))}
      />
    </>
  )
}
