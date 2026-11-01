'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarCheck, Loader2, Mail, MessageCircle, Phone, PhoneCall, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/cn'

// Parcours de l'agent d'accueil dans le chatbot du site (cahier « 3 interfaces » V2, phases 1-2) :
//  - rendez-vous : motif → langue → 3 créneaux (heure de Cayenne) → coordonnées → confirmation ;
//  - rappel : nom, numéro, sujet ;
//  - représentant : sujet → disponibilité réelle (horaires) → appel / WhatsApp, sinon RDV, rappel, e-mail.
// Les textes conversationnels viennent du back-office (config.messages) ; les libellés d'interface
// des messages next-intl. Rien n'est conservé dans le navigateur.

export type AgentConfig = {
  messages: Record<string, string>
  types: { code: string; label: string; service: string }[]
  services: { code: string; label: string }[]
  email: string
}
export type FlowKind = 'rdv' | 'rappel' | 'humain'
export type FlowStart = { kind: FlowKind; type?: string; service?: string }

type Slot = { start: string; date: string; time: string }
type Lang = 'fr' | 'en' | 'pt'

/** Jour (AAAA-MM-JJ) à Cayenne, fuseau de l'agenda (UTC-3, sans heure d'été). */
const CAYENNE_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cayenne', year: 'numeric', month: '2-digit', day: '2-digit' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Date et heure d'un créneau dans la langue du site (l'échange peut se faire dans une autre langue). */
function fmtSlot(iso: string, locale: Lang): { date: string; time: string } {
  const lang = locale === 'pt' ? 'pt-BR' : locale === 'en' ? 'en-GB' : 'fr-FR'
  const d = new Date(iso)
  return {
    date: cap(new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Cayenne' }).format(d)),
    time: new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Cayenne' }).format(d),
  }
}

/** Dans une phrase : « le lundi 2 novembre » (minuscule en français et en portugais). */
const inSentence = (d: { date: string; time: string }, locale: Lang) => (locale === 'en' ? d : { ...d, date: d.date.charAt(0).toLowerCase() + d.date.slice(1) })

const LANGS: { code: Lang; label: string }[] = [{ code: 'fr', label: 'Français' }, { code: 'en', label: 'English' }, { code: 'pt', label: 'Português' }]

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string; message?: string }> {
  try {
    const res = await fetch(url, init ? { ...init, headers: { 'Content-Type': 'application/json' } } : undefined)
    const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null
    if (!res.ok || !body) return { ok: false, status: res.status, code: body?.error?.code, message: body?.error?.message }
    return { ok: true, data: body }
  } catch {
    return { ok: false, status: 0 }
  }
}

const fill = (text: string, v: { date?: string; time?: string; email?: string }) =>
  text.replace('[DATE]', v.date ?? '').replace('[HEURE]', v.time ?? '').replace('[EMAIL]', v.email ?? '')

export function AgentFlow({
  start, config, locale, phone, whatsapp, onDone, onClose, onSwitch,
}: {
  start: FlowStart
  config: AgentConfig
  locale: Lang
  phone: string
  whatsapp: string
  /** Texte final ajouté au fil de la conversation (confirmation). */
  onDone: (text: string) => void
  onClose: () => void
  onSwitch: (next: FlowStart) => void
}) {
  const t = useTranslations('public.assistant.agent')
  const m = config.messages
  const uid = useId()
  const box = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'type' | 'lang' | 'slots' | 'contact' | 'service' | 'checking' | 'human' | 'callback'>(() =>
    start.kind === 'rappel' ? 'callback' : start.kind === 'humain' ? (start.service ? 'checking' : 'service') : start.type ? 'lang' : 'type')
  const [type, setType] = useState(start.type ?? '')
  const [lang, setLang] = useState<Lang>(locale)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [service, setService] = useState(start.service)
  // Rappels : case décochée par défaut (consentement explicite).
  const [form, setForm] = useState({ name: '', phone: '', email: '', reason: '', consent: false, website: '' })

  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' })
  }, [step, slots])

  const loadSlots = async (after?: string, keepError = false) => {
    setBusy(true)
    if (!keepError) setError(null)
    const q = new URLSearchParams({ type, lang, ...(after ? { after } : {}) })
    const r = await api<{ slots: Slot[] }>(`/api/assistant/creneaux?${q}`)
    setBusy(false)
    if (!r.ok) {
      setError(m.AGENDA_DOWN ?? t('error'))
      setSlots([])
      return
    }
    setSlots(r.data.slots)
  }

  // Représentant : disponibilité au moment de la demande (jamais hors horaires).
  const checkHuman = async (code: string) => {
    setService(code)
    setStep('checking')
    const r = await api<{ available: boolean }>(`/api/assistant/representant?${new URLSearchParams({ service: code, lang: locale })}`)
    setAvailable(r.ok ? r.data.available && Boolean(phone || whatsapp) : false)
    setStep('human')
  }
  useEffect(() => {
    if (start.kind === 'humain' && start.service) void checkHuman(start.service)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const book = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slot) return
    setBusy(true)
    setError(null)
    const r = await api<{ ref?: string; start?: string; emailSent: boolean; pending: boolean }>('/api/assistant/rendez-vous', {
      method: 'POST',
      body: JSON.stringify({
        type, lang, start: slot.start, name: form.name, phone: form.phone || undefined, email: form.email,
        reason: form.reason || undefined, remindersConsent: form.consent, website: form.website || undefined,
      }),
    })
    setBusy(false)
    if (!r.ok) {
      if (r.code === 'slot_taken') {
        setError(r.message ?? t('slotTaken'))
        setSlot(null)
        setStep('slots')
        void loadSlots(undefined, true)
        return
      }
      setError(r.message ?? (r.status === 0 || r.status >= 500 ? m.AGENDA_DOWN : t('error')))
      return
    }
    // Réservation tenue 30 min : la personne confirme par le lien reçu (aucun lien renvoyé ici).
    const when = inSentence(fmtSlot(r.data.start ?? slot.start, locale), locale)
    onDone([fill(m.APPT_PENDING ?? '', when), r.data.ref ? `${t('ref')} : ${r.data.ref}` : '', r.data.emailSent ? '' : t('emailNotSent')].filter(Boolean).join('\n'))
  }

  const callback = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await api('/api/assistant/rappel', {
      method: 'POST',
      body: JSON.stringify({ lang: locale, name: form.name, phone: form.phone, reason: form.reason, service, website: form.website || undefined }),
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.message ?? t('error'))
      return
    }
    onDone(m.CALLBACK_DONE ?? '')
  }

  const chip = 'rounded-full bg-white px-3 py-2 text-left text-[13.5px] font-semibold text-iris-700 ring-1 ring-iris-200 hover:bg-iris-50 disabled:opacity-60'
  const field = 'mt-1 block h-11 w-full rounded-xl border border-night-200 bg-white px-3 text-[15px] text-night-900 focus:border-iris-500 focus:outline-none focus:ring-2 focus:ring-iris-200'
  const primary = 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-iris-600 px-4 text-[15px] font-bold text-white hover:bg-iris-700 disabled:opacity-60'
  const action = 'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[14px] font-semibold ring-1 transition-colors'
  const say = (text?: string) => (text ? <p className="text-[14.5px] leading-relaxed text-night-900">{text}</p> : null)
  const title = start.kind === 'rdv' ? t('titleRdv') : start.kind === 'rappel' ? t('titleCallback') : t('titleHuman')

  const contactFields = (withEmail: boolean) => (
    <>
      <label className="block text-[13px] font-semibold text-night-700">
        {t('name')}
        <input required minLength={2} maxLength={120} autoComplete="name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="block text-[13px] font-semibold text-night-700">
        {t('phone')}{withEmail ? ` (${t('optional')})` : ''}
        <input type="tel" inputMode="tel" required={!withEmail} autoComplete="tel" maxLength={20} className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      {withEmail && (
        <label className="block text-[13px] font-semibold text-night-700">
          {t('email')}
          <input type="email" required autoComplete="email" maxLength={254} className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <span className="mt-1 block text-[12px] font-normal text-night-500">{t('emailHint')}</span>
        </label>
      )}
      {/* Champ piège, invisible pour les personnes et les lecteurs d'écran. */}
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
    </>
  )

  return (
    <div ref={box} role="group" aria-labelledby={`${uid}-title`} className="mt-3 space-y-3 rounded-2xl bg-white p-3 ring-1 ring-iris-200">
      <div className="flex items-center justify-between gap-2">
        <p id={`${uid}-title`} className="flex items-center gap-2 text-[13.5px] font-bold text-night-800">
          {start.kind === 'rdv' ? <CalendarCheck className="h-4 w-4 text-iris-600" aria-hidden /> : start.kind === 'rappel' ? <PhoneCall className="h-4 w-4 text-iris-600" aria-hidden /> : <UserRound className="h-4 w-4 text-iris-600" aria-hidden />}
          {title}
        </p>
        <button type="button" onClick={onClose} aria-label={t('cancel')} className="grid h-9 w-9 place-items-center rounded-full text-night-500 hover:bg-night-50">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {step === 'type' && (
        <>
          {say(m.ASK_APPOINTMENT_REASON)}
          <div className="flex flex-wrap gap-2">
            {config.types.map((ty) => (
              <button key={ty.code} type="button" className={chip} onClick={() => { setType(ty.code); setStep('lang') }}>{ty.label}</button>
            ))}
          </div>
        </>
      )}

      {step === 'lang' && (
        <>
          {say(m.ASK_LANGUAGE)}
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button key={l.code} type="button" lang={l.code} className={cn(chip, l.code === lang && 'bg-iris-50')} onClick={() => { setLang(l.code); setStep('slots'); setSlots(null) }}>{l.label}</button>
            ))}
          </div>
        </>
      )}

      {step === 'slots' && <SlotsStep locale={locale} slots={slots} busy={busy} load={loadSlots} m={m} t={t} chip={chip} onPick={(s) => { setSlot(s); setStep('contact') }} onCallback={() => onSwitch({ kind: 'rappel' })} />}

      {step === 'contact' && slot && (
        <form onSubmit={book} className="space-y-3">
          <p className="rounded-xl bg-iris-50 px-3 py-2 text-[14px] font-semibold text-night-900">{fmtSlot(slot.start, locale).date} · {fmtSlot(slot.start, locale).time} <span className="font-normal normal-case text-night-600">({t('tz')})</span></p>
          {say(m.ASK_CONTACT)}
          {contactFields(true)}
          <label className="block text-[13px] font-semibold text-night-700">
            {t('reason')} ({t('optional')})
            <textarea maxLength={500} rows={2} className={cn(field, 'h-auto py-2')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <label className="flex items-start gap-2 text-[13px] text-night-700">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            {t('consent')}
          </label>
          <p className="text-[12px] text-night-500">{t('privacy')}</p>
          <button type="submit" disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t('confirm')}</button>
          <button type="button" onClick={() => setStep('slots')} className="w-full text-[13px] font-semibold text-iris-700 underline">{t('otherSlot')}</button>
        </form>
      )}

      {step === 'callback' && (
        <form onSubmit={callback} className="space-y-3">
          {say(m.ASK_CALLBACK)}
          {contactFields(false)}
          <label className="block text-[13px] font-semibold text-night-700">
            {t('topic')}
            <textarea required minLength={2} maxLength={500} rows={2} className={cn(field, 'h-auto py-2')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <p className="text-[12px] text-night-500">{t('privacy')}</p>
          <button type="submit" disabled={busy} className={primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t('sendCallback')}</button>
        </form>
      )}

      {step === 'service' && (
        <>
          {say(t('askService'))}
          <div className="flex flex-wrap gap-2">
            {config.services.map((s) => (
              <button key={s.code} type="button" className={chip} onClick={() => void checkHuman(s.code)}>{s.label}</button>
            ))}
          </div>
        </>
      )}

      {step === 'checking' && <p role="status" className="flex items-center gap-2 text-[14px] text-night-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('checking')}</p>}

      {step === 'human' && (
        <div className="space-y-2">
          {available ? say(m.HUMAN_AVAILABLE) : say(m.HUMAN_UNAVAILABLE)}
          {available && phone && (
            <a href={`tel:${phone}`} className={cn(action, 'bg-iris-50 text-iris-800 ring-iris-100 hover:bg-iris-100')}><Phone className="h-5 w-5 text-iris-600" aria-hidden />{t('callNow')}</a>
          )}
          {available && whatsapp && (
            <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t('whatsappText'))}`} target="_blank" rel="noopener noreferrer" className={cn(action, 'bg-leaf-50 text-leaf-800 ring-leaf-200 hover:bg-leaf-100')}><MessageCircle className="h-5 w-5 text-leaf-600" aria-hidden />{t('whatsapp')}</a>
          )}
          <button type="button" onClick={() => onSwitch({ kind: 'rdv' })} className={cn(action, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}><CalendarCheck className="h-5 w-5 text-iris-600" aria-hidden />{t('titleRdv')}</button>
          <button type="button" onClick={() => onSwitch({ kind: 'rappel', service })} className={cn(action, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}><PhoneCall className="h-5 w-5 text-iris-600" aria-hidden />{t('titleCallback')}</button>
          <a href={`mailto:${config.email}`} className={cn(action, 'bg-white text-night-800 ring-night-200 hover:bg-night-50')}>
            <Mail className="h-5 w-5 text-night-600" aria-hidden />
            <span className="flex min-w-0 flex-col leading-tight">{t('email')}<span className="text-[12.5px] font-medium text-night-500">{fill(m.EMAIL_SLA ?? '', { email: config.email })}</span></span>
          </a>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-alert-50 px-3 py-2 text-[13.5px] text-alert-800">{error}</p>}
    </div>
  )
}

function SlotsStep({ locale, slots, busy, load, m, t, chip, onPick, onCallback }: {
  locale: Lang; slots: Slot[] | null; busy: boolean; load: (after?: string) => Promise<void>; m: Record<string, string>
  t: ReturnType<typeof useTranslations>; chip: string; onPick: (s: Slot) => void; onCallback: () => void
}) {
  useEffect(() => {
    if (slots === null) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (slots === null || (busy && !slots.length)) return <p role="status" className="flex items-center gap-2 text-[14px] text-night-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('loadingSlots')}</p>
  if (!slots.length) {
    return (
      <>
        <p className="text-[14.5px] text-night-900">{m.NO_SLOTS}</p>
        <button type="button" className={chip} onClick={onCallback}>{t('titleCallback')}</button>
      </>
    )
  }
  const last = slots[slots.length - 1]!
  return (
    <>
      <p className="text-[14.5px] text-night-900">{m.ASK_SLOT}</p>
      <div className="grid gap-2">
        {slots.map((s) => (
          <button key={s.start} type="button" className={cn(chip, 'flex justify-between')} onClick={() => onPick(s)}>
            <span>{fmtSlot(s.start, locale).date}</span><span className="font-bold">{fmtSlot(s.start, locale).time}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={() => void load(`${CAYENNE_DAY.format(new Date(Date.parse(last.start) + 86_400_000))}T00:00:00-03:00`)} className="text-[13px] font-semibold text-iris-700 underline disabled:opacity-60">
        {t('moreSlots')}
      </button>
    </>
  )
}
