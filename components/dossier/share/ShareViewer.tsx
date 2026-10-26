'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle, CalendarClock, Download, FileText, KeyRound, Link2Off, Loader2, Lock, MessageCircle, Printer, Quote,
} from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'
import { frDate, frSize } from '@/lib/mock-vault'
import type { ShareContent } from '@/lib/partages'
import { DEFAULT_TZ } from '@/lib/tz'

type View =
  | { k: 'loading' }
  | { k: 'code'; error: string | null; busy: boolean }
  | { k: 'locked'; message: string }
  | { k: 'invalid' }
  | { k: 'error' }
  | { k: 'ready'; content: ShareContent; accessKey: string }

const card = 'rounded-2xl border border-night-100 bg-white shadow-[0_1px_2px_rgba(11,45,91,0.05),0_12px_30px_-18px_rgba(11,45,91,0.2)]'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'

const dateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: DEFAULT_TZ })} à ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ })}`

/** Visionneuse publique d'un partage avocat (code d'accès éventuel, puis lecture seule). */
export function ShareViewer({ token }: { token: string }) {
  const [view, setView] = useState<View>({ k: 'loading' })

  const open = useCallback(async (code?: string) => {
    try {
      const res = await fetch(`/api/partage/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(code ? { code } : {}),
        cache: 'no-store',
      })
      const json = (await res.json().catch(() => null)) as
        | { content?: ShareContent; accessKey?: string; error?: { message?: string } }
        | null
      if (res.ok && json?.content && json.accessKey) {
        setView({ k: 'ready', content: json.content, accessKey: json.accessKey })
      } else if (res.status === 401) {
        setView({ k: 'code', error: null, busy: false })
      } else if (res.status === 403) {
        setView({ k: 'code', error: json?.error?.message ?? 'Code incorrect.', busy: false })
      } else if (res.status === 429) {
        setView({ k: 'locked', message: json?.error?.message ?? 'Trop de tentatives. Réessayez plus tard.' })
      } else if (res.status === 404) {
        setView({ k: 'invalid' })
      } else {
        setView({ k: 'error' })
      }
    } catch {
      setView({ k: 'error' })
    }
  }, [token])

  useEffect(() => { void open() }, [open])

  return (
    <div className="min-h-dvh bg-[#f7f8fc] text-night-900 print:bg-white">
      <header className="border-b border-night-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <Logo size="sm" layout="inline" />
          <p className="inline-flex items-center gap-1.5 rounded-full bg-night-50 px-3 py-1.5 text-[12px] font-semibold text-night-800">
            <Lock className="h-3.5 w-3.5 text-leaf-600" aria-hidden="true" />
            Consultation en lecture seule
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 lg:px-8">
        {view.k === 'loading' && (
          <div role="status" className="flex flex-col items-center py-24 text-center">
            <Loader2 className="h-8 w-8 text-night-700 motion-safe:animate-spin" aria-hidden="true" />
            <p className="mt-3 text-[14px] text-night-700">Ouverture du dossier partagé…</p>
          </div>
        )}

        {view.k === 'code' && (
          <CodePrompt
            error={view.error}
            busy={view.busy}
            onSubmit={(code) => {
              setView({ k: 'code', error: null, busy: true })
              void open(code)
            }}
          />
        )}

        {view.k === 'locked' && (
          <Notice icon={<KeyRound className="h-7 w-7" aria-hidden="true" />} title="Accès temporairement bloqué" tone="alert">
            {view.message} Ce délai protège le dossier contre les tentatives répétées.
          </Notice>
        )}

        {view.k === 'invalid' && (
          <Notice icon={<Link2Off className="h-7 w-7" aria-hidden="true" />} title="Ce lien n'est plus valide">
            Il a peut-être expiré ou été révoqué par le parent. Demandez-lui de générer un nouveau lien de partage.
          </Notice>
        )}

        {view.k === 'error' && (
          <Notice icon={<AlertTriangle className="h-7 w-7" aria-hidden="true" />} title="Dossier momentanément indisponible" tone="alert">
            Vérifiez votre connexion puis réessayez.
            <button type="button" onClick={() => { setView({ k: 'loading' }); void open() }} className={cn('mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white hover:bg-leaf-600 active:scale-[0.98]', focusRing)}>
              Réessayer
            </button>
          </Notice>
        )}

        {view.k === 'ready' && <SharedDossier content={view.content} token={token} accessKey={view.accessKey} />}
      </main>
    </div>
  )
}

function Notice({ icon, title, children, tone = 'neutral' }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: 'neutral' | 'alert' }) {
  return (
    <section role={tone === 'alert' ? 'alert' : 'status'} className={cn(card, 'mx-auto mt-10 flex max-w-md flex-col items-center p-8 text-center')}>
      <span className={cn('grid h-16 w-16 place-items-center rounded-full', tone === 'alert' ? 'bg-alert-50 text-alert-600' : 'bg-night-50 text-night-700')}>{icon}</span>
      <h1 className="mt-4 text-[18px] font-extrabold text-night-900">{title}</h1>
      <div className="mt-2 flex flex-col items-center text-[14px] text-night-600">{children}</div>
    </section>
  )
}

function CodePrompt({ error, busy, onSubmit }: { error: string | null; busy: boolean; onSubmit: (code: string) => void }) {
  const uid = useId()
  const [code, setCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [error])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (/^\d{6}$/.test(code)) onSubmit(code)
  }

  return (
    <section aria-labelledby={`${uid}-t`} className={cn(card, 'mx-auto mt-10 max-w-md p-6')}>
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
        <KeyRound className="h-6 w-6" />
      </span>
      <h1 id={`${uid}-t`} className="mt-4 text-[20px] font-extrabold text-night-900">Code d&apos;accès requis</h1>
      <p className="mt-1.5 text-[14px] text-night-600">
        Ce dossier est protégé. Saisissez le code à 6 chiffres que le parent vous a communiqué séparément.
      </p>
      <form onSubmit={submit} className="mt-5" noValidate>
        <label htmlFor={`${uid}-code`} className="block text-[13px] font-semibold text-night-900">Code d&apos;accès</label>
        <input
          ref={inputRef}
          id={`${uid}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-err` : `${uid}-hint`}
          className="mt-1.5 h-14 w-full rounded-xl border border-night-200 bg-white px-4 text-center text-[24px] font-bold tracking-[0.5em] tabular-nums text-night-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
        />
        {error ? (
          <p id={`${uid}-err`} role="alert" className="mt-2 text-[13px] font-semibold text-alert-600">{error}</p>
        ) : (
          <p id={`${uid}-hint`} className="mt-2 text-[12px] text-night-600">5 essais maximum par période de 15 minutes.</p>
        )}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className={cn('mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white transition hover:bg-leaf-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50', focusRing)}
        >
          {busy && <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />}
          {busy ? 'Vérification…' : 'Ouvrir le dossier'}
        </button>
      </form>
    </section>
  )
}

function SharedDossier({ content, token, accessKey }: { content: ShareContent; token: string; accessKey: string }) {
  const sections = [
    { id: 'chronologie', label: 'Chronologie', count: content.timeline.length, show: content.periode !== null },
    { id: 'documents', label: 'Documents', count: content.documents.length, show: content.documents.length > 0 },
    { id: 'temoignages', label: 'Témoignages', count: content.testimonies.length, show: content.testimonies.length > 0 },
    { id: 'messages', label: 'Messages', count: content.messages.length, show: content.messages.length > 0 },
  ].filter((s) => s.show)

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-4 lg:sticky lg:top-6">
        <section aria-labelledby="share-summary" className={cn(card, 'p-5')}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-leaf-700">Dossier partagé</p>
          <h1 id="share-summary" className="mt-1 text-[22px] font-extrabold leading-tight text-night-900">
            {content.child ? `Dossier concernant ${content.child}` : 'Dossier parental'}
          </h1>
          <dl className="mt-4 space-y-2.5 text-[13px]">
            <div>
              <dt className="text-night-600">Transmis par</dt>
              <dd className="font-semibold text-night-900">{content.owner}</dd>
            </div>
            <div>
              <dt className="text-night-600">Destinataire</dt>
              <dd className="font-semibold text-night-900">{content.label}</dd>
            </div>
            {content.periode && (
              <div>
                <dt className="text-night-600">Période</dt>
                <dd className="font-semibold text-night-900">du {frDate(content.periode.from)} au {frDate(content.periode.to)}</dd>
              </div>
            )}
            <div>
              <dt className="text-night-600">Lien valable jusqu&apos;au</dt>
              <dd className="font-semibold text-night-900">{dateTime(content.expiresAt)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => window.print()}
            className={cn('mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-night-200 bg-white px-4 text-[14px] font-semibold text-night-900 hover:bg-night-50 active:scale-[0.98] print:hidden', focusRing)}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimer ou enregistrer en PDF
          </button>
        </section>

        {sections.length > 1 && (
          <nav aria-label="Sections du dossier" className={cn(card, 'p-2 print:hidden')}>
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={cn('flex min-h-[44px] items-center justify-between rounded-xl px-3 text-[14px] font-semibold text-night-800 hover:bg-night-50', focusRing)}>
                    {s.label}
                    <span className="text-[12px] font-bold tabular-nums text-night-600">{s.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <p className="px-1 text-[12px] text-night-600">
          Document confidentiel transmis dans le cadre d&apos;une procédure. Chaque consultation de ce lien est enregistrée et visible par le parent.
        </p>
      </aside>

      <div className="min-w-0 space-y-6">
        {sections.length === 0 && (
          <section className={cn(card, 'p-6 text-center text-[14px] text-night-600')}>Ce partage ne contient aucun élément sur la période choisie.</section>
        )}

        {content.periode !== null && (
          <section id="chronologie" aria-labelledby="h-chrono" className={cn(card, 'scroll-mt-6 p-5')}>
            <SectionTitle id="h-chrono" icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />} title="Chronologie du journal" count={content.timeline.length} />
            {content.timeline.length === 0 ? (
              <p className="mt-3 text-[14px] text-night-600">Aucun événement sur la période.</p>
            ) : (
              <ol className="mt-4 space-y-4 border-l-2 border-night-100 pl-4">
                {content.timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <span aria-hidden="true" className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-leaf-500" />
                    <p className="text-[12px] font-semibold text-night-600">
                      <time dateTime={e.date}>{frDate(e.date)}</time>{e.heure ? ` · ${e.heure}` : ''} · {e.type}
                    </p>
                    <h3 className="text-[15px] font-bold text-night-900">{e.titre}</h3>
                    {e.lieu && <p className="text-[13px] text-night-600">Lieu : {e.lieu}</p>}
                    {e.description && <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-night-800">{e.description}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {content.documents.length > 0 && (
          <section id="documents" aria-labelledby="h-docs" className={cn(card, 'scroll-mt-6 p-5')}>
            <SectionTitle id="h-docs" icon={<FileText className="h-5 w-5" aria-hidden="true" />} title="Documents" count={content.documents.length} />
            <ul className="mt-4 divide-y divide-night-100">
              {content.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-night-50 text-[10px] font-extrabold text-night-700">{d.ext}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-night-900">{d.name}</span>
                    <span className="block text-[12px] text-night-600">{frDate(d.date)} · {frSize(d.sizeBytes)}</span>
                  </span>
                  <a
                    href={`/api/partage/${encodeURIComponent(token)}/document/${encodeURIComponent(d.id)}?k=${encodeURIComponent(accessKey)}`}
                    rel="noreferrer"
                    aria-label={`Télécharger ${d.name}`}
                    className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-night-200 bg-white px-3 text-[13px] font-semibold text-night-900 hover:bg-night-50 print:hidden', focusRing)}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Télécharger</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {content.testimonies.length > 0 && (
          <section id="temoignages" aria-labelledby="h-tmg" className={cn(card, 'scroll-mt-6 p-5')}>
            <SectionTitle id="h-tmg" icon={<Quote className="h-5 w-5" aria-hidden="true" />} title="Témoignages reçus" count={content.testimonies.length} />
            <ul className="mt-4 space-y-4">
              {content.testimonies.map((t) => (
                <li key={t.id} className="rounded-xl border-l-4 border-gold-300 bg-night-50/50 p-4">
                  <p className="text-[14px] font-bold text-night-900">{t.author}{t.relation ? <span className="font-normal text-night-600"> · {t.relation}</span> : null}</p>
                  <p className="text-[12px] text-night-600">Reçu le {frDate(t.date)}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-night-800">{t.summary}</p>
                  {t.facts.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-night-800">
                      {t.facts.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {content.messages.length > 0 && (
          <section id="messages" aria-labelledby="h-msg" className={cn(card, 'scroll-mt-6 p-5')}>
            <SectionTitle id="h-msg" icon={<MessageCircle className="h-5 w-5" aria-hidden="true" />} title="Messages entre les parents" count={content.messages.length} />
            <p className="mt-1 text-[12px] text-night-600">Messages horodatés à l&apos;envoi, ni modifiables ni supprimables.</p>
            <ol className="mt-4 space-y-3">
              {content.messages.map((m) => (
                <li key={m.id} className={cn('flex', m.fromOwner ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5', m.fromOwner ? 'rounded-br-md bg-leaf-50 ring-1 ring-inset ring-leaf-100' : 'rounded-bl-md border border-night-100 bg-white')}>
                    <p className="text-[11px] font-bold text-night-700">{m.sender} · <time dateTime={m.createdAt}>{dateTime(m.createdAt)}</time></p>
                    {m.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-night-900">{m.body}</p>}
                    {m.attachmentName && <p className="mt-1 text-[12px] text-night-600">Pièce jointe : {m.attachmentName}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ id, icon, title, count }: { id: string; icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600">{icon}</span>
      <h2 id={id} className="flex-1 text-[17px] font-extrabold text-night-900">{title}</h2>
      <span className="rounded-full bg-night-50 px-2.5 py-1 text-[12px] font-bold tabular-nums text-night-700">
        {count} <span className="sr-only">éléments</span>
      </span>
    </div>
  )
}
