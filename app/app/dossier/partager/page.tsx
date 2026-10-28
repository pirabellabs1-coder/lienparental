'use client'

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy, FileText, KeyRound, Mail, MessageCircle, NotebookText, Quote, ShieldCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { copyText } from '@/components/coffre/CopyLinkField'
import { btn, card } from '@/components/ui/kit'
import { Sheet } from '@/components/messages/Sheet'
import { ChildPicker, CheckRow, PeriodPicker } from '@/components/dossier/pickers'
import { ShareList } from '@/components/dossier/share/ShareList'
import { inPeriod, loadDossierSource, presetPeriod, readSelection, type DossierSource, type Period, type PeriodPreset } from '@/components/dossier/data'
import { cn } from '@/lib/cn'
import { formatDay } from '@/components/famille/useFamilyFormat'
import { intlLocale } from '@/lib/i18n/config'
import { DEFAULT_TZ, dayKeyInTz } from '@/lib/tz'
import {
  createShare, EXPIRY_OPTIONS, listShares, revokeShare, type CreateShareResult, type ShareExpiry, type ShareSummary,
} from '@/lib/partages'

// Jour d'un instant dans DEFAULT_TZ (même règle que « Mon dossier »).
const localDayOf = (iso: string) => dayKeyInTz(iso)

// Partage temporaire en lecture seule avec l'avocat : contenu choisi, expiration, code facultatif,
// liste des partages avec révocation et journal des consultations.
export default function PartagerPage() {
  const t = useTranslations('family.courtFile.share')
  const locale = useLocale()
  const frDate = (d: string, style: 'long' | 'short' = 'long') => formatDay(d, locale, style)
  const uid = useId()
  const [source, setSource] = useState<DossierSource | null>(null)
  const [shares, setShares] = useState<ShareSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const { announce, node: announcer } = useAnnounce(3000)

  const [label, setLabel] = useState('')
  const [childId, setChildId] = useState('')
  const [preset, setPreset] = useState<PeriodPreset>('6m')
  const [period, setPeriod] = useState<Period>(() => presetPeriod('6m'))
  const [journal, setJournal] = useState(true)
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [testimonyIds, setTestimonyIds] = useState<string[]>([])
  const [messages, setMessages] = useState(false)
  const [expiry, setExpiry] = useState<ShareExpiry>('7j')
  const [withCode, setWithCode] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateShareResult | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [src, list] = await Promise.all([loadDossierSource(), listShares()])
      const sel = readSelection()
      setSource(src)
      setShares(list)
      setChildId(src.children.find((c) => c.id === sel?.childId)?.id ?? src.children[0]?.id ?? '')
      if (sel) {
        setPreset(sel.preset)
        setPeriod(sel.period)
        setDocumentIds(sel.documentIds.filter((id) => src.documents.some((d) => d.id === id)))
        // Sections choisies sur « Mon dossier » : l'export des messages coché y était perdu (défaut : non).
        if (sel.journal !== undefined) setJournal(sel.journal)
        if (sel.messages !== undefined) setMessages(sel.messages && !!src.conversation)
      }
      setTestimonyIds(sel?.testimonies === false ? [] : src.testimonies.map((tm) => tm.id))
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const periodError = period.from > period.to ? t('periodError') : null

  const journalCount = useMemo(
    () => (source ? source.journal.filter((e) => e.childIds.includes(childId) && inPeriod(e.date, period)).length : 0),
    [source, childId, period],
  )
  const messageCount = useMemo(
    () => (source?.conversation?.messages ?? []).filter((m) => inPeriod(localDayOf(m.createdAt), period)).length,
    [source, period],
  )

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!label.trim()) { setFormError(t('recipientRequired')); return }
    if (periodError) { setFormError(periodError); return }
    if (!journal && documentIds.length === 0 && testimonyIds.length === 0 && !messages) {
      setFormError(t('contentRequired'))
      return
    }
    setSubmitting(true)
    try {
      const result = await createShare({
        label: label.trim(),
        expiry,
        withCode,
        scope: { childId: childId || null, journal: journal ? period : null, documentIds, testimonyIds, messages },
      })
      setShares((list) => [result.share, ...(list ?? [])])
      setCreated(result)
      setLabel('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const onRevoke = async (id: string) => {
    await revokeShare(id)
    setShares((list) => (list ?? []).map((s) => (s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s)))
  }

  if (loadError) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app/dossier" />
        <ErrorState compact title={t('unavailable')} description={t('unavailableText')} primary={{ label: t('retry'), onClick: () => void load() }} secondary={{ label: t('backToFile'), href: '/app/dossier' }} />
      </>
    )
  }

  if (!source || !shares) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app/dossier" />
        <LoadingState compact title={t('loading')} description="" />
      </>
    )
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/dossier" />

      <div className="w-full px-5 pb-8 pt-2">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={submit} noValidate className="space-y-5" aria-labelledby={`${uid}-form`}>
            <h2 id={`${uid}-form`} className="sr-only">{t('newShare')}</h2>
            <p className="text-[14px] text-night-600">
              {t('intro')}
            </p>

            <section className={cn(card, 'p-4')}>
              <label htmlFor={`${uid}-label`} className="block text-[15px] font-bold text-night-900">{t('recipient')}</label>
              <input
                id={`${uid}-label`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder={t('recipientPlaceholder')}
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-xl border border-night-200 bg-white px-3.5 text-[15px] text-night-900 placeholder:text-night-500 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
              />
              <p className="mt-1.5 text-[12px] text-night-600">{t('recipientHint')}</p>
            </section>

            {source.children.length > 0 && (
              <section className={cn(card, 'p-4')}>
                <ChildPicker children={source.children} value={childId} onChange={setChildId} />
              </section>
            )}

            <section className={cn(card, 'space-y-3 p-4')} aria-labelledby={`${uid}-content`}>
              <h2 id={`${uid}-content`} className="text-[15px] font-bold text-night-900">{t('content')}</h2>

              <CheckRow
                checked={journal}
                onChange={setJournal}
                icon={<NotebookText className="h-[18px] w-[18px]" />}
                label={t('journalLabel')}
                description={t('journalDescription')}
                count={journalCount}
                countLabel={t('eventsUnit')}
              >
                {journal && (
                  <div className="border-t border-night-100 p-3">
                    <PeriodPicker preset={preset} period={period} error={periodError} onChange={(p, per) => { setPreset(p); setPeriod(per) }} />
                  </div>
                )}
              </CheckRow>

              <fieldset className="rounded-xl border border-night-100 p-3">
                <legend className="flex items-center gap-2 px-1 text-[14px] font-bold text-night-900">
                  <FileText className="h-4 w-4 text-night-700" aria-hidden="true" />
                  {t('documentsCount', { count: documentIds.length, total: source.documents.length })}
                </legend>
                {source.documents.length === 0 ? (
                  <p className="text-[12px] text-night-600">{t('noDocuments')}</p>
                ) : (
                  <ul className="grid gap-1 lg:grid-cols-2">
                    {source.documents.map((d) => (
                      <li key={d.id}>
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-night-50">
                          <input type="checkbox" checked={documentIds.includes(d.id)} onChange={(e) => setDocumentIds((l) => toggle(l, d.id, e.target.checked))} className="h-[18px] w-[18px] shrink-0 accent-[#2e7d32]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-night-900">{d.name}</span>
                            <span className="block text-[11px] text-night-600">{d.ext} · {frDate(d.docDate, 'short')}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <fieldset className="rounded-xl border border-night-100 p-3">
                <legend className="flex items-center gap-2 px-1 text-[14px] font-bold text-night-900">
                  <Quote className="h-4 w-4 text-night-700" aria-hidden="true" />
                  {t('testimoniesCount', { count: testimonyIds.length, total: source.testimonies.length })}
                </legend>
                {source.testimonies.length === 0 ? (
                  <p className="text-[12px] text-night-600">{t('noTestimonies')}</p>
                ) : (
                  <ul className="grid gap-1">
                    {source.testimonies.map((tm) => (
                      <li key={tm.id}>
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-night-50">
                          <input type="checkbox" checked={testimonyIds.includes(tm.id)} onChange={(e) => setTestimonyIds((l) => toggle(l, tm.id, e.target.checked))} className="h-[18px] w-[18px] shrink-0 accent-[#2e7d32]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-night-900">{tm.author}{tm.relation ? `, ${tm.relation}` : ''}</span>
                            <span className="block text-[11px] text-night-600">{t('receivedOn', { date: frDate(tm.date, 'short') })}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <CheckRow
                checked={messages}
                onChange={setMessages}
                disabled={!source.conversation}
                icon={<MessageCircle className="h-[18px] w-[18px]" />}
                label={t('messagesLabel')}
                description={source.conversation ? t('messagesWith', { name: source.conversation.other.prenom }) : t('noConversation')}
                count={source.conversation ? messageCount : undefined}
                countLabel={t('messagesUnit')}
              />
            </section>

            <section className={cn(card, 'space-y-4 p-4')}>
              <fieldset>
                <legend className="mb-2.5 text-[15px] font-bold text-night-900">{t('validity')}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {EXPIRY_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        'flex min-h-[48px] cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
                        expiry === o.value ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-night-200 bg-white text-night-900 hover:bg-night-50',
                      )}
                    >
                      <input type="radio" name={`${uid}-expiry`} value={o.value} checked={expiry === o.value} onChange={() => setExpiry(o.value)} className="sr-only" />
                      {t(`expiry.${o.value}`)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label htmlFor={`${uid}-code`} className="flex min-h-[48px] cursor-pointer items-center justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-night-900">{t('protectWithCode')}</span>
                  <span id={`${uid}-code-d`} className="block text-[12px] text-night-600">{t('codeHint')}</span>
                </span>
                <span className="relative inline-flex shrink-0">
                  <input id={`${uid}-code`} type="checkbox" role="switch" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} aria-describedby={`${uid}-code-d`} className="peer sr-only" />
                  <span aria-hidden="true" className="h-7 w-12 rounded-full bg-night-200 transition-colors peer-checked:bg-leaf-500 peer-focus-visible:ring-2 peer-focus-visible:ring-leaf-400 peer-focus-visible:ring-offset-2" />
                  <span aria-hidden="true" className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200 peer-checked:translate-x-5" />
                </span>
              </label>
            </section>

            {formError && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{formError}</p>}

            <button type="submit" disabled={submitting} className={cn(btn.primary, 'w-full')}>
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              {submitting ? t('creating') : t('create')}
            </button>
          </form>

          <section aria-labelledby={`${uid}-list`} className="lg:sticky lg:top-20">
            <h2 id={`${uid}-list`} className="mb-2.5 text-[15px] font-bold text-night-900">{t('myShares')}</h2>
            <ShareList shares={shares} onRevoke={onRevoke} announce={announce} />
          </section>
        </div>
      </div>

      <CreatedSheet result={created} onClose={() => setCreated(null)} announce={announce} />
      {announcer}
    </>
  )
}

function CreatedSheet({ result, onClose, announce }: { result: CreateShareResult | null; onClose: () => void; announce: (m: string) => void }) {
  const t = useTranslations('family.courtFile.share')
  const locale = useLocale()
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const url = result ? `${window.location.origin}${result.share.path}` : ''
  const expires = result
    ? new Date(result.share.expiresAt).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ })
    : ''

  const copy = async (what: 'link' | 'code', text: string) => {
    if (await copyText(text)) {
      setCopied(what)
      announce(what === 'link' ? t('linkCopied') : t('codeCopied'))
      setTimeout(() => setCopied(null), 2200)
    }
  }

  const mail = result
    ? `mailto:?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(
        `${t('mailBody', { expires, url })}\n\n${result.code ? `${t('mailCode')}\n\n` : ''}${t('mailSignature')}`,
      )}`
    : '#'

  return (
    <Sheet
      open={result !== null}
      onClose={onClose}
      title={t('createdTitle')}
      description={result ? t('createdDescription', { label: result.share.label, expires }) : undefined}
    >
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-night-100 bg-night-50/60 py-1 pl-3.5 pr-1">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-night-800">{url.replace(/^https?:\/\//, '')}</p>
            <button
              type="button"
              data-autofocus
              onClick={() => void copy('link', url)}
              aria-label={copied === 'link' ? t('linkCopied') : t('copyLink')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-night-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
            >
              {copied === 'link' ? <Check className="h-5 w-5 text-leaf-600" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>

          {result.code && (
            <div className="rounded-xl border border-gold-200 bg-gold-50 p-3.5">
              <p className="flex items-center gap-2 text-[13px] font-bold text-night-900">
                <KeyRound className="h-4 w-4 text-gold-700" aria-hidden="true" />
                {t('accessCode')}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[26px] font-bold tabular-nums tracking-[0.3em] text-night-900" aria-label={t('codeAria', { code: result.code.split('').join(' ') })}>
                  {result.code}
                </p>
                <button
                  type="button"
                  onClick={() => void copy('code', result.code!)}
                  aria-label={copied === 'code' ? t('codeCopied') : t('copyCode')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-night-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
                >
                  {copied === 'code' ? <Check className="h-5 w-5 text-leaf-600" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-1.5 text-[12px] text-night-800">
                {t('codeNote')}
              </p>
            </div>
          )}

          <a href={mail} className={cn(btn.secondary, 'w-full')}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {t('sendByEmail')}
          </a>
          <button type="button" onClick={onClose} className={cn(btn.primary, 'w-full')}>
            {t('done')}
          </button>
        </div>
      )}
    </Sheet>
  )
}
