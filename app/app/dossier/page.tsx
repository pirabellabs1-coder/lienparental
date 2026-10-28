'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle, CalendarDays, FileDown, FileText, Info, Loader2, MessageCircle, NotebookText, Quote, Share2, UserRound, Users, Wallet,
} from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { btn, card } from '@/components/ui/kit'
import { ChildPicker, CheckRow, PeriodPicker } from '@/components/dossier/pickers'
import {
  dossierFilename, loadDossierSource, presetPeriod, readSelection, saveSelection,
  type DossierSource, type Period, type PeriodPreset,
} from '@/components/dossier/data'
import {
  composeDossier, filterSource, SECTION_ORDER, sectionCounts, summarizeExpenses, toServerPayload, type SectionKey,
} from '@/components/dossier/compose'
import { cn } from '@/lib/cn'
import { useAsyncData } from '@/lib/data/core'
import { listJournalExpenses } from '@/lib/data/journal'
import { frSize } from '@/lib/mock-vault'
import { fmtSize } from '@/components/journal/journalData'
import { useFinanceLabels } from '@/components/journal/financeLabels'
import { useFamilyFormat } from '@/components/famille/useFamilyFormat'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'

const SECTION_ICONS: Record<SectionKey, React.ReactNode> = {
  infos: <UserRound className="h-[18px] w-[18px]" />,
  journal: <NotebookText className="h-[18px] w-[18px]" />,
  calendrier: <CalendarDays className="h-[18px] w-[18px]" />,
  documents: <FileText className="h-[18px] w-[18px]" />,
  temoignages: <Quote className="h-[18px] w-[18px]" />,
  frais: <Wallet className="h-[18px] w-[18px]" />,
  messages: <MessageCircle className="h-[18px] w-[18px]" />,
}

const UNAVAILABLE_KEYS: Record<string, string> = {
  profil: 'profile', journal: 'journal', calendrier: 'calendar', documents: 'documents', 'témoignages': 'testimonies', messages: 'messages', 'dépenses': 'expenses',
}

const ALL_SECTIONS: Record<SectionKey, boolean> = {
  infos: true, journal: true, calendrier: true, documents: true, temoignages: true, frais: true, messages: true,
}

// « Mon dossier » : export du dossier JAF en un clic (enfant, période, sections), et accès au
// partage temporaire avec l'avocat.
export default function DossierPage() {
  const t = useTranslations('family.courtFile.page')
  const tSec = useTranslations('family.courtFile.sections')
  const fl = useFinanceLabels()
  const fmt = useFamilyFormat()
  const formatTotals = fl.totals
  const frDate = (d: string, style: 'long' | 'short' = 'long') => fmt.day(d, style)
  // Rubriques non chargées (libellés de lib : 'profil', 'journal'…) → libellé traduit.
  const sourceLabel = (k: string) => (UNAVAILABLE_KEYS[k] ? t(`unavailableParts.${UNAVAILABLE_KEYS[k]}`) : k)
  const router = useRouter()
  const [source, setSource] = useState<DossierSource | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [childId, setChildId] = useState('')
  const [preset, setPreset] = useState<PeriodPreset>('6m')
  const [period, setPeriod] = useState<Period | null>(null)
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(ALL_SECTIONS)
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle')
  const { announce, node: announcer } = useAnnounce(3200)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const src = await loadDossierSource()
      const saved = readSelection()
      setSource(src)
      const child = src.children.find((c) => c.id === saved?.childId) ?? src.children[0]
      setChildId(child?.id ?? '')
      if (saved) {
        setPreset(saved.preset)
        setPeriod(saved.period)
        setDocumentIds(saved.documentIds.filter((id) => src.documents.some((d) => d.id === id)))
      } else {
        setPeriod(presetPeriod('6m'))
        setDocumentIds(src.documents.map((d) => d.id))
      }
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const periodError = period && period.from > period.to ? t('periodError') : null

  // Section « Dépenses et pension » : lecture dédiée des dépenses du Journal sur la période
  // (non tronquée, bornes dans le fuseau de l'utilisateur), rechargée quand la période change.
  const expensesState = useAsyncData(
    () => (period && !periodError ? listJournalExpenses({ fromDay: period.from, toDay: period.to }) : Promise.resolve([])),
    `dossier-expenses:${period?.from ?? ''}:${period?.to ?? ''}`,
  )
  const expenses = expensesState.data
  const expensesFailed = Boolean(expensesState.error)

  const filtered = useMemo(() => {
    if (!source || !period || (!expenses && !expensesFailed)) return null
    return filterSource(source, { childId, period, documentIds, expenses: expenses ?? [] })
  }, [source, period, childId, documentIds, expenses, expensesFailed])
  const unavailable = source ? [...source.unavailable, ...(expensesFailed ? ['dépenses'] : [])] : []

  const counts = filtered ? sectionCounts(filtered) : null
  // Mêmes listes et totaux que la section du PDF (chaque opération dans une seule liste).
  const money = useMemo(() => (filtered ? summarizeExpenses(filtered.expenses) : null), [filtered])
  const child = source?.children.find((c) => c.id === childId) ?? null
  const included = SECTION_ORDER.filter((k) => sections[k])
  const totalItems = counts ? included.filter((k) => k !== 'infos').reduce((n, k) => n + counts[k], 0) : 0
  // Dépenses en cours de (re)chargement pour la période : on attend des totaux à jour.
  const canGenerate = Boolean(child && filtered && !periodError && !expensesState.loading && included.length > 0 && status !== 'generating')

  const toggleSection = (k: SectionKey, v: boolean) => setSections((s) => ({ ...s, [k]: v }))

  const generate = async () => {
    if (!source || !child || !filtered || !period || !canGenerate) return
    setStatus('generating')
    try {
      const model = composeDossier(source, child, period, sections, filtered)
      let blob: Blob | null = null

      // 1) Rendu serveur (gabarit lib/pdf/templates/DossierJAF.tsx), session Supabase requise.
      const payload = SUPABASE_ENABLED ? toServerPayload(model) : null
      if (payload) {
        try {
          const res = await fetch('/api/pdf/dossier-jaf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: payload }),
          })
          if (res.ok && (res.headers.get('content-type') ?? '').includes('application/pdf')) blob = await res.blob()
        } catch { /* repli navigateur ci-dessous */ }
      }

      // 2) Repli (démo, 401, indisponibilité) : rendu dans le navigateur.
      if (!blob) {
        const { renderDossierPdf } = await import('@/components/dossier/dossierPdf')
        blob = await renderDossierPdf(model)
      }

      const { downloadBlob } = await import('@/components/dossier/pdfKit')
      const filename = dossierFilename(child.prenom)
      downloadBlob(blob, filename)
      setStatus('idle')
      announce(t('downloaded', { filename }))
    } catch {
      setStatus('error')
    }
  }

  const goShare = () => {
    if (!period) return
    // Les sections cochées (journal, témoignages, messages) sont reprises par le partage avocat.
    saveSelection({ childId, preset, period, documentIds, journal: sections.journal, testimonies: sections.temoignages, messages: sections.messages })
    router.push('/app/dossier/partager')
  }

  if (loadError) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app" />
        <ErrorState compact title={t('unavailable')} description={t('unavailableText')} primary={{ label: t('retry'), onClick: () => void load() }} />
      </>
    )
  }

  if (!source || !period || !filtered || !counts) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app" />
        <LoadingState compact title={t('preparing')} description="" />
      </>
    )
  }

  if (source.children.length === 0 || !child) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app" />
        <EmptyState
          compact
          icon={<Users className="h-9 w-9" strokeWidth={1.6} />}
          title={t('noChildTitle')}
          description={t('noChildText')}
          primary={{ label: t('addChild'), href: '/app/enfants' }}
        />
      </>
    )
  }

  const allDocsSelected = documentIds.length === source.documents.length

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" />

      <div className="w-full px-5 pb-8 pt-2">
        <p className="mb-5 max-w-2xl text-[14px] text-night-600">
          {t('intro')}
        </p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-5">
            <section className={cn(card, 'p-4')}>
              <ChildPicker children={source.children} value={childId} onChange={setChildId} />
            </section>

            <section className={cn(card, 'p-4')}>
              <PeriodPicker
                preset={preset}
                period={period}
                error={periodError}
                onChange={(p, per) => { setPreset(p); setPeriod(per) }}
              />
            </section>

            <section className={cn(card, 'p-4')} aria-labelledby="dossier-sections">
              <h2 id="dossier-sections" className="text-[15px] font-bold text-night-900">{t('content')}</h2>
              <p className="mb-3 mt-0.5 text-[12px] text-night-600">{t('countHint', { name: child.prenom })}</p>
              <div className="space-y-2.5">
                {SECTION_ORDER.map((k) => (
                  <CheckRow
                    key={k}
                    checked={sections[k]}
                    onChange={(v) => toggleSection(k, v)}
                    icon={SECTION_ICONS[k]}
                    label={tSec(`${k}.label`)}
                    description={tSec(`${k}.description`)}
                    count={k === 'infos' ? undefined : counts[k]}
                    countLabel={tSec(`${k}.unit`)}
                  >
                    {k === 'frais' && sections.frais && money && filtered && filtered.expenses.length > 0 && (
                      <dl className="grid gap-x-4 gap-y-1.5 border-t border-night-100 px-3 pb-3 pt-2.5 text-[12px] sm:grid-cols-3">
                        {([
                          [t('moneyPaid'), money.depenses],
                          [t('moneyReceived'), money.recues],
                          [t('moneyThird'), money.tiers],
                        ] as const).map(([label, g]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-night-600">{label} ({g.items.length})</dt>
                            <dd className="font-bold tabular-nums text-night-900">
                              {formatTotals(g.totals)}
                              {g.reste.length > 0 && <span className="block text-[11px] font-semibold text-night-700">{t('remainingDue', { value: formatTotals(g.reste) })}</span>}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {k === 'documents' && sections.documents && source.documents.length > 0 && (
                      <fieldset className="border-t border-night-100 px-3 pb-3 pt-2">
                        <legend className="sr-only">{t('docsToInclude')}</legend>
                        <div className="flex items-center justify-between gap-2 py-1">
                          <p className="text-[12px] font-semibold text-night-700">
                            {t('selectedCount', { count: documentIds.length, total: source.documents.length })}
                          </p>
                          <button
                            type="button"
                            onClick={() => setDocumentIds(allDocsSelected ? [] : source.documents.map((d) => d.id))}
                            className="inline-flex h-11 items-center rounded-lg px-2 text-[12px] font-bold text-leaf-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
                          >
                            {allDocsSelected ? t('deselectAll') : t('selectAll')}
                          </button>
                        </div>
                        <ul className="grid gap-1 lg:grid-cols-2">
                          {source.documents.map((d) => (
                            <li key={d.id}>
                              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-white">
                                <input
                                  type="checkbox"
                                  checked={documentIds.includes(d.id)}
                                  onChange={(e) => setDocumentIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                                  className="h-[18px] w-[18px] shrink-0 accent-[#2e7d32]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-semibold text-night-900">{d.name}</span>
                                  <span className="block text-[11px] text-night-600">{d.ext} · {frDate(d.docDate, 'short')} · {fmt.locale === 'fr' ? frSize(d.size) : fmtSize(d.size, fmt.locale)}</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                    )}
                  </CheckRow>
                ))}
              </div>
              {unavailable.length > 0 && (
                <p className="mt-3 flex gap-2 rounded-xl bg-gold-50 p-3 text-[12px] text-gold-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {t('partialLoad', { parts: unavailable.map(sourceLabel).join(', ') })}
                    {expensesFailed && (
                      <>
                        {' '}
                        <button type="button" onClick={() => void expensesState.refresh()} className="font-bold underline underline-offset-2 hover:text-gold-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400">
                          {t('reloadExpenses')}
                        </button>
                      </>
                    )}
                  </span>
                </p>
              )}
            </section>
          </div>

          <aside aria-labelledby="dossier-preview" className="lg:sticky lg:top-20">
            <section className={cn(card, 'p-4')}>
              <h2 id="dossier-preview" className="text-[15px] font-bold text-night-900">{t('preview')}</h2>
              <p className="mt-0.5 text-[12px] text-night-600">
                {child.prenom} · {t('periodRange', { from: frDate(period.from, 'short'), to: frDate(period.to, 'short') })}
              </p>
              {included.length === 0 ? (
                <p className="mt-3 rounded-xl bg-night-50/70 p-3 text-[13px] text-night-700">{t('noSection')}</p>
              ) : (
                <ol className="mt-3 divide-y divide-night-100 rounded-xl bg-night-50/50 px-3">
                  {included.map((k, i) => (
                    <li key={k} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                      <span className="text-night-900"><span className="font-bold tabular-nums text-night-600">{i + 1}.</span> {tSec(`${k}.label`)}</span>
                      {k !== 'infos' && (
                        <span className={cn('shrink-0 font-bold tabular-nums', counts[k] === 0 ? 'text-night-500' : 'text-night-900')}>
                          {counts[k]}
                          <span className="sr-only"> {tSec(`${k}.unit`)}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-[12px] text-night-600" aria-live="polite">
                {t('totalItems', { count: totalItems })}
              </p>

              {status === 'error' && (
                <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('generateFailed')}
                </p>
              )}

              <button type="button" onClick={() => void generate()} disabled={!canGenerate} className={cn(btn.primary, 'mt-4 w-full')}>
                {status === 'generating' ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> : <FileDown className="h-5 w-5" aria-hidden="true" />}
                {status === 'generating' ? t('generating') : t('generate')}
              </button>
              <button type="button" onClick={goShare} disabled={Boolean(periodError)} className={cn(btn.secondary, 'mt-2.5 w-full')}>
                <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
                {t('shareWithLawyer')}
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-night-600">
                {t('reviewNote')}
              </p>
            </section>
          </aside>
        </div>
      </div>
      {announcer}
    </>
  )
}
