'use client'

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  BookOpen, CalendarDays, CornerDownLeft, FileText, History, LayoutGrid, Lock,
  MessageSquareQuote, Search, X, type LucideIcon,
} from 'lucide-react'
import { VAULT_DOCS, TESTIMONY_REQUESTS, frDate, getVaultCategory, receivedCount, type TestimonyRequest, type VaultDocument } from '@/lib/mock-vault'
import { mockJournalEntries, type JournalEntry } from '@/lib/mock-data'
import { EVENTS, dayOf, fmtDateMedium, fmtTime, getEventType, type CalendarEvent } from '@/lib/calendrier'
import { LIVE } from '@/lib/data/core'
import { listEvents } from '@/lib/data/calendar'
import { listJournal } from '@/lib/data/journal'
import { listCategories, listDocuments } from '@/lib/data/vault'
import { listTestimonyRequests } from '@/lib/data/testimonies'
import { cn } from '@/lib/cn'
import { useVaultLockState } from '@/components/vault-lock/useVaultLockState'

/** Événement DOM permettant d'ouvrir la recherche depuis n'importe quel bouton. */
export const OPEN_SEARCH_EVENT = 'lp:open-search'

const RECENT_KEY = 'lp-recent-searches'
const RECENT_MAX = 5
const PER_SECTION = 5

type SectionKey = 'documents' | 'journal' | 'calendrier' | 'temoignages' | 'pages'

type T = ReturnType<typeof useTranslations>

// Libellés traduits au rendu : account.search.sections.{key}.
const SECTIONS: Record<SectionKey, { icon: LucideIcon }> = {
  documents: { icon: FileText },
  journal: { icon: BookOpen },
  calendrier: { icon: CalendarDays },
  temoignages: { icon: MessageSquareQuote },
  pages: { icon: LayoutGrid },
}
const SECTION_ORDER: SectionKey[] = ['documents', 'journal', 'calendrier', 'temoignages', 'pages']

// Libellés traduits (account.search.pages.{key}) ; mots-clés français conservés + mots-clés traduits
// (account.search.keywords.{key}) pour chercher dans les deux langues.
const PAGES: { key: string; href: string; keywords?: string }[] = [
  { key: 'home', href: '/app', keywords: 'tableau de bord dashboard' },
  { key: 'journal', href: '/app/journal', keywords: 'notes chronologie' },
  { key: 'calendar', href: '/app/calendrier', keywords: 'agenda planning rendez-vous' },
  { key: 'vault', href: '/app/coffre', keywords: 'documents preuves' },
  { key: 'coach', href: '/app/coach', keywords: 'assistant conseil' },
  { key: 'children', href: '/app/enfants', keywords: 'enfant famille' },
  { key: 'profile', href: '/app/profil', keywords: 'compte' },
  { key: 'security', href: '/app/profil/securite', keywords: 'mot de passe connexion' },
  { key: 'preferences', href: '/app/profil/preferences', keywords: 'apparence taille du texte notifications langue' },
  { key: 'help', href: '/app/aide', keywords: 'aide faq support contact' },
  { key: 'custody', href: '/app/garde', keywords: 'garde alternance' },
  { key: 'finances', href: '/app/journal?filtre=finances', keywords: 'finances depenses paiements argent pension frais' },
]
const QUICK_LINKS = ['/app/journal', '/app/calendrier', '/app/coffre', '/app/coach', '/app/aide']

// Types de journal traduits : account.search.journalTypes.{type} (repli : « Note »).
const JOURNAL_TYPES = new Set(['visite', 'appel', 'message', 'sante', 'depense', 'autre'])

type Item = {
  id: string
  section: SectionKey
  title: string
  subtitle?: string
  href: string
  /** Titre replié (sans accents, minuscules). */
  titleKey: string
  /** Ensemble des champs recherchables, repliés. */
  haystack: string
}

type Row =
  | { kind: 'item'; key: string; item: Item }
  | { kind: 'recent'; key: string; query: string }

type Group = { key: string; label: string; icon: LucideIcon; rows: Row[] }

/* ----- Normalisation insensible aux accents ------------------------------ */

function foldChar(c: string) {
  return c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase()
}
const fold = foldChar

/** Replie le texte en conservant, pour chaque caractère replié, l'index d'origine. */
function foldWithMap(text: string) {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i])
    for (let k = 0; k < f.length; k++) { folded += f[k]; map.push(i) }
  }
  return { folded, map }
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>
  const { folded, map } = foldWithMap(text)
  const ranges: [number, number][] = []
  for (const t of terms) {
    let from = 0
    let idx: number
    while (t && (idx = folded.indexOf(t, from)) !== -1) {
      ranges.push([map[idx], map[idx + t.length - 1] + 1])
      from = idx + t.length
    }
  }
  if (ranges.length === 0) return <>{text}</>
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  const out: ReactNode[] = []
  let cursor = 0
  merged.forEach(([s, e], i) => {
    if (s > cursor) out.push(<Fragment key={`t${i}`}>{text.slice(cursor, s)}</Fragment>)
    out.push(<mark key={`m${i}`} className="rounded-[4px] bg-leaf-100 px-0.5 font-bold text-leaf-800">{text.slice(s, e)}</mark>)
    cursor = e
  })
  if (cursor < text.length) out.push(<Fragment key="end">{text.slice(cursor)}</Fragment>)
  return <>{out}</>
}

/* ----- Index de recherche ------------------------------------------------- */

type JournalLike = Pick<JournalEntry, 'id' | 'type' | 'title' | 'date' | 'heure' | 'description' | 'lieu'>

/** Contenus indexés : jeux fictifs en démonstration, données du compte (RLS) sinon. */
type IndexSource = {
  docs: VaultDocument[]
  journal: JournalLike[]
  events: CalendarEvent[]
  requests: TestimonyRequest[]
  categoryName: (id: string) => string | undefined
}

const DEMO_SOURCE: IndexSource = {
  docs: VAULT_DOCS,
  journal: mockJournalEntries,
  events: EVENTS,
  requests: TESTIMONY_REQUESTS,
  categoryName: (id) => getVaultCategory(id)?.name,
}

const EMPTY_SOURCE: IndexSource = { docs: [], journal: [], events: [], requests: [], categoryName: () => undefined }

/**
 * Compte réel : contenus chargés à l'ouverture de la recherche. Coffre (documents,
 * témoignages) uniquement s'il est déverrouillé. Une source en erreur est simplement absente.
 */
async function loadLiveSource(vaultOpen: boolean): Promise<IndexSource> {
  const none = Promise.resolve([] as never[])
  const [journal, events, docs, requests, categories] = await Promise.allSettled([
    listJournal(),
    listEvents(),
    vaultOpen ? listDocuments() : none,
    vaultOpen ? listTestimonyRequests() : none,
    vaultOpen ? listCategories() : none,
  ])
  const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : [])
  const cats = new Map(ok(categories).map((c) => [c.id, c.name]))
  return { journal: ok(journal), events: ok(events), docs: ok(docs), requests: ok(requests), categoryName: (id) => cats.get(id) }
}

/**
 * `vaultOpen` : documents et témoignages (coffre-fort) indexés UNIQUEMENT si le coffre est
 * déverrouillé ; sinon ils ne sont ni chargés ni cherchés (fail closed pendant la vérification).
 */
function buildIndex(vaultOpen: boolean, src: IndexSource, t: T): Item[] {
  const items: Item[] = []
  const push = (section: SectionKey, id: string, title: string, href: string, subtitle: string | undefined, extra: (string | undefined)[]) => {
    items.push({
      id: `${section}:${id}`, section, title, subtitle, href,
      titleKey: fold(title),
      haystack: fold([title, subtitle, ...extra].filter(Boolean).join(' ')),
    })
  }

  for (const d of vaultOpen ? src.docs : []) {
    const cat = src.categoryName(d.categoryId)
    push('documents', d.id, d.name, `/app/coffre/documents/${d.id}`,
      [cat, frDate(d.docDate, 'short')].filter(Boolean).join(' · '),
      [d.description, d.source, d.ext])
  }
  for (const j of src.journal) {
    push('journal', j.id, j.title, `/app/journal/${j.id}`,
      [JOURNAL_TYPES.has(j.type) ? t(`journalTypes.${j.type}`) : t('journalTypes.note'), frDate(j.date, 'short'), j.heure].filter(Boolean).join(' · '),
      [j.description, j.lieu])
  }
  for (const e of src.events) {
    push('calendrier', e.id, e.title, `/app/calendrier/${e.id}`,
      [getEventType(e.type).label, fmtDateMedium(dayOf(e.start)), fmtTime(e.start)].join(' · '),
      [e.location, e.description])
  }
  for (const r of vaultOpen ? src.requests : []) {
    const status = r.status === 'termine' ? t('requestDone') : t('requestPending')
    push('temoignages', r.id, r.subject, `/app/coffre/temoignages/${r.id}`,
      `${status} · ${t('received', { count: receivedCount(r), total: r.witnesses.length })}`,
      [r.context, ...r.parents, ...r.enfants])
  }
  for (const p of PAGES) push('pages', p.href, t(`pages.${p.key}`), p.href, undefined, [p.keywords, t(`keywords.${p.key}`)])
  return items
}

function score(item: Item, phrase: string, terms: string[]): number {
  if (item.titleKey.startsWith(phrase)) return 0
  if (item.titleKey.includes(phrase)) return 1
  if (terms.every(t => item.titleKey.includes(t))) return 2
  if (item.haystack.includes(phrase)) return 3
  if (terms.every(t => item.haystack.includes(t))) return 4
  return -1
}

/* ----- Recherches récentes ------------------------------------------------ */

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}
function writeRecents(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* stockage indisponible */ }
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'

/* ----- Composant ---------------------------------------------------------- */

export function CommandPalette() {
  const t = useTranslations('account.search')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [recents, setRecents] = useState<string[]>([])

  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const uid = useId()
  const titleId = `${uid}-title`
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-opt-${i}`

  const close = useCallback(() => setOpen(false), [])

  // Ouverture : Ctrl+K / Cmd+K et événement DOM `lp:open-search`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  }, [])

  // Cycle de vie de la modale : focus initial, verrouillage du scroll, restauration du focus.
  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRecents(readRecents())
    setQuery('')
    setActive(0)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = prevOverflow
      const el = previousFocus.current
      if (el && el.isConnected) el.focus()
    }
  }, [open])

  // Verrou du coffre vérifié à chaque ouverture de la recherche.
  const { state: vault } = useVaultLockState({ enabled: open })
  const vaultOpen = vault === 'open'
  const [liveSource, setLiveSource] = useState<IndexSource>(EMPTY_SOURCE)
  useEffect(() => {
    if (!LIVE || !open) return
    let alive = true
    loadLiveSource(vaultOpen).then((src) => { if (alive) setLiveSource(src) }, () => { /* pages seules */ })
    return () => { alive = false }
  }, [open, vaultOpen])
  const source = LIVE ? liveSource : DEMO_SOURCE
  const index = useMemo(() => (open ? buildIndex(vaultOpen, source, t) : []), [open, vaultOpen, source, t])

  const phrase = fold(query.trim()).replace(/\s+/g, ' ')
  const terms = useMemo(() => (phrase ? Array.from(new Set(phrase.split(' '))).filter(Boolean) : []), [phrase])

  const quickRows = useMemo<Row[]>(() => (
    index
      .filter(i => i.section === 'pages' && QUICK_LINKS.includes(i.href))
      .map(item => ({ kind: 'item' as const, key: item.id, item }))
  ), [index])

  const clearRecents = useCallback(() => {
    writeRecents([])
    setRecents([])
    setActive(0)
    inputRef.current?.focus()
  }, [])

  const groups = useMemo<Group[]>(() => {
    if (!phrase) {
      const out: Group[] = []
      if (recents.length > 0) {
        out.push({
          key: 'recent', label: t('recent'), icon: History,
          rows: recents.map(q => ({ kind: 'recent' as const, key: `recent:${q}`, query: q })),
        })
      }
      out.push({ key: 'quick', label: t('quick'), icon: LayoutGrid, rows: quickRows })
      return out
    }
    const buckets = new Map<SectionKey, { item: Item; s: number }[]>()
    for (const item of index) {
      const s = score(item, phrase, terms)
      if (s < 0) continue
      const b = buckets.get(item.section) ?? []
      b.push({ item, s })
      buckets.set(item.section, b)
    }
    return SECTION_ORDER.flatMap(key => {
      const b = buckets.get(key)
      if (!b || b.length === 0) return []
      b.sort((a, c) => a.s - c.s)
      return [{
        key, label: t(`sections.${key}`), icon: SECTIONS[key].icon,
        rows: b.slice(0, PER_SECTION).map(({ item }) => ({ kind: 'item' as const, key: item.id, item })),
      }]
    })
  }, [phrase, terms, index, recents, quickRows, t])

  const noResults = Boolean(phrase) && groups.length === 0
  const visibleGroups: Group[] = noResults ? [{ key: 'quick', label: t('quick'), icon: LayoutGrid, rows: quickRows }] : groups
  const flat = visibleGroups.flatMap(g => g.rows)
  const resultCount = noResults ? 0 : flat.length

  // Garde l'index actif dans les bornes et visible à l'écran.
  useEffect(() => { setActive(0) }, [phrase])
  useEffect(() => {
    if (!open) return
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, uid])

  const choose = (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'recent') {
      setQuery(row.query)
      inputRef.current?.focus()
      return
    }
    const q = query.trim()
    if (q) {
      const next = [q, ...readRecents().filter(r => fold(r) !== fold(q))].slice(0, RECENT_MAX)
      writeRecents(next)
    }
    setOpen(false)
    router.push(row.item.href)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[Math.min(active, flat.length - 1)]) }
  }

  // Échap ferme, Tab reste piégé dans la modale.
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  if (!open) return null

  let rowIndex = -1
  const activeIdx = Math.min(active, Math.max(flat.length - 1, 0))

  return (
    <div className="fixed inset-0 z-[70] flex sm:items-start sm:justify-center sm:px-4 sm:pt-[12vh]">
      <div
        aria-hidden="true"
        onClick={close}
        className="absolute inset-0 hidden bg-night-950/40 backdrop-blur-sm sm:block"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
        className={cn(
          'relative flex h-full w-full flex-col bg-white font-sans text-night-900',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'sm:h-auto sm:max-h-[76vh] sm:max-w-xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-night-100 sm:pb-0 sm:pt-0',
          'sm:shadow-[0_24px_60px_-20px_rgba(11,45,91,0.35)]',
        )}
      >
        <h2 id={titleId} className="sr-only">{t('dialogTitle')}</h2>

        <div className="flex items-center gap-2 border-b border-night-100 px-3 sm:px-4">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-night-400" strokeWidth={2} />
          <label htmlFor={`${uid}-input`} className="sr-only">{t('inputLabel')}</label>
          <input
            ref={inputRef}
            id={`${uid}-input`}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length > 0 ? optionId(activeIdx) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('placeholder')}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-night-900 placeholder:text-night-500 focus:outline-none focus-visible:shadow-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              aria-label={t('clear')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-500 hover:bg-night-50 hover:text-night-900"
            >
              <X aria-hidden className="h-4 w-4" strokeWidth={2.4} />
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl px-2 text-[14px] font-semibold text-leaf-600 hover:text-leaf-700 sm:px-1"
          >
            <span aria-hidden className="sm:hidden">{t('cancel')}</span>
            <kbd aria-hidden className="hidden rounded-md border border-night-200 bg-night-50 px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-night-600 sm:inline">{t('keys.esc')}</kbd>
          </button>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {phrase ? (resultCount === 0 ? t('noResultsFor', { query: query.trim() }) : t('resultCount', { count: resultCount })) : ''}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-2 sm:flex-initial">
          {noResults && (
            <div className="px-3 pb-2 pt-6 text-center">
              <p className="text-[15px] font-semibold text-night-900">
                {t.rich('noResultsQuoted', { query: query.trim(), q: (chunks) => <span className="break-words">{chunks}</span> })}
              </p>
              <p className="mt-1 text-[13px] text-night-500">
                {vaultOpen ? t('noResultsHint') : t('noResultsLocked')}
              </p>
            </div>
          )}

          {!vaultOpen && (
            <div className="mx-1 mb-1 mt-1 flex items-center gap-3 rounded-xl border border-night-100 bg-night-50/60 px-3 py-2.5">
              <Lock aria-hidden className="h-4 w-4 shrink-0 text-night-700" strokeWidth={2.2} />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-night-800">
                {vault === 'loading' ? t('vaultChecking') : t('vaultLocked')}
              </p>
              {vault !== 'loading' && (
                <Link
                  href="/app/coffre"
                  onClick={close}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-[13px] font-bold text-leaf-600 hover:bg-leaf-50 hover:text-leaf-700"
                >
                  {t('unlock')}
                </Link>
              )}
            </div>
          )}

          <div role="listbox" id={listboxId} aria-label={t('results')}>
            {visibleGroups.map(g => {
              const headId = `${uid}-g-${g.key}`
              const GIcon = g.icon
              return (
                <div key={g.key} role="group" aria-labelledby={headId} className="mt-2 first:mt-0">
                  <div id={headId} className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[12px] font-bold uppercase tracking-wide text-night-500">
                    <GIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
                    {g.label}
                  </div>
                  <ul role="presentation">
                    {g.rows.map(row => {
                      rowIndex += 1
                      const i = rowIndex
                      const isActive = i === activeIdx
                      const RIcon = row.kind === 'recent' ? History : SECTIONS[row.item.section].icon
                      return (
                        <li
                          key={row.key}
                          id={optionId(i)}
                          role="option"
                          aria-selected={isActive}
                          onMouseMove={() => { if (active !== i) setActive(i) }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => choose(row)}
                          className={cn(
                            'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2',
                            isActive ? 'bg-night-50' : 'bg-white',
                          )}
                        >
                          <span aria-hidden className={cn(
                            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                            isActive ? 'bg-leaf-50 text-leaf-600' : 'bg-night-50 text-night-600',
                          )}>
                            <RIcon className="h-[18px] w-[18px]" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-semibold text-night-900">
                              {row.kind === 'recent' ? row.query : <Highlight text={row.item.title} terms={terms} />}
                            </span>
                            {row.kind === 'item' && row.item.subtitle && (
                              <span className="block truncate text-[12.5px] text-night-500">{row.item.subtitle}</span>
                            )}
                          </span>
                          <CornerDownLeft
                            aria-hidden
                            className={cn('hidden h-4 w-4 shrink-0 text-night-400 sm:block', isActive ? 'opacity-100' : 'opacity-0')}
                            strokeWidth={2}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>

          {!phrase && recents.length > 0 && (
            <div className="px-1 pt-2">
              <button
                type="button"
                onClick={clearRecents}
                className="inline-flex min-h-[44px] items-center rounded-xl px-2 text-[13px] font-semibold text-night-600 hover:bg-night-50 hover:text-night-900"
              >
                {t('clearRecent')}
              </button>
            </div>
          )}
        </div>

        <div aria-hidden className="hidden items-center gap-4 border-t border-night-100 bg-night-50/50 px-4 py-2.5 text-[12px] text-night-500 sm:flex">
          <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t('keys.navigate')}</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>{t('keys.enter')}</Kbd> {t('keys.open')}</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>{t('keys.esc')}</Kbd> {t('keys.close')}</span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-md border border-night-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-night-600">
      {children}
    </kbd>
  )
}
