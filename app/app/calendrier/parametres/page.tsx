'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarCheck2, CheckCircle2, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { typeStyle } from '@/components/calendrier/eventTypeStyles'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { GoogleLogo } from '@/components/auth/GoogleButton'
import { RadioGroup, Switch, Button, Badge, ConfirmDialog } from '@/components/ui'
import {
  EVENT_TYPES, REMINDER_OPTIONS, DEFAULT_TYPE_REMINDER_ENABLED,
  type EventTypeKey, type ReminderKey,
} from '@/lib/calendrier'
import { currentTz } from '@/lib/tz'
import { useTimeZone } from '@/components/tz/TimeZoneProvider'
import { useTzLabel } from '@/components/tz/useTzLabel'
import Link from 'next/link'
import { resetGoogleSyncHint } from '@/lib/integrations/google/client'
import type { CalendarTarget, GoogleCalendarState, MaskMode, SyncResponse, UiEventType } from '@/lib/integrations/google/types'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'

export default function ParametresCalendrierPage() {
  const t = useTranslations('calendar.settings')
  const f = useCalFormat()
  const [defaultReminder, setDefaultReminder] = useState<ReminderKey>('1h')
  const [enabled, setEnabled] = useState<Record<EventTypeKey, boolean>>(DEFAULT_TYPE_REMINDER_ENABLED)
  const tt = useTranslations('shared.timezones')
  const tz = useTimeZone()
  const tzLabel = useTzLabel()
  const [saved, setSaved] = useState(false)

  const onSave = () => {
    // Supabase plug-in point : upsert dans `user_preferences` (reminder_default, type_toggles, timezone)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/calendrier/rappels" showBell={false} />
      <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-2">
      <section className="mt-5">
        <h2 className="font-display text-sm font-semibold text-night-900">{t('defaultTitle')}</h2>
        <p className="mt-0.5 text-xs text-night-500">{t('defaultHint')}</p>
        <div className="mt-2">
          <RadioGroup
            value={defaultReminder}
            onChange={(v) => setDefaultReminder(v as ReminderKey)}
            options={REMINDER_OPTIONS.map(o => ({ value: o.value, label: f.reminderLabel(o.value) }))}
            columns={1}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold text-night-900">{t('byTypeTitle')}</h2>
        <p className="mt-0.5 text-xs text-night-500">{t('byTypeHint')}</p>
        <div className="mt-2 rounded-xl2 border border-night-100 bg-white shadow-soft divide-y divide-night-100 px-4">
          {EVENT_TYPES.map((et) => (
            <Switch
              key={et.key}
              label={<span className="inline-flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', typeStyle(et.key).dot)} aria-hidden="true" />{f.typeLabel(et.key)}</span>}
              checked={enabled[et.key]}
              onChange={(e) => setEnabled(prev => ({ ...prev, [et.key]: e.target.checked }))}
            />
          ))}
        </div>
      </section>

      {/* Fuseau : préférence unique du compte (Préférences > Général), appliquée partout. */}
      <section className="mt-6" aria-labelledby="cal-tz-title">
        <h2 id="cal-tz-title" className="font-display text-sm font-semibold text-night-900">{t('tzLabel')}</h2>
        <p className="mt-1 text-sm text-night-700">
          {tt('current', { zone: tzLabel(tz) })}{' '}
          <Link href="/app/profil/preferences/general" className="font-semibold text-leaf-700 underline underline-offset-2 hover:text-leaf-800">{tt('change')}</Link>
        </p>
        <p className="mt-0.5 text-xs text-night-500">{t('tzHint')}</p>
      </section>

      <div className="mt-6">
        <Button variant="primary" full size="lg" onClick={onSave}>
          {t('save')}
        </Button>
        {saved && (
          <p role="status" aria-live="polite" className="mt-2 text-center text-sm font-medium text-leaf-700">
            {t('saved')}
          </p>
        )}
      </div>

      <GoogleCalendarSection />
      </div>
    </>
  )
}

// --- Synchronisation Google Agenda (chantier G) --------------------------------

const API = '/api/integrations/google/calendar'

// Retour de Google (?google=…) : ton du message ; texte = calendar.google.return.<code>.
const RETURN_TONES: Record<string, 'ok' | 'error'> = {
  connecte: 'ok',
  refuse: 'error',
  etat_invalide: 'error',
  autorisation_incomplete: 'error',
  indisponible: 'error',
  non_configure: 'error',
  erreur: 'error',
}

// Libellés : calendar.google.mask.<value> / <value>Desc.
const MASK_VALUES: MaskMode[] = ['sensitive', 'all', 'none']

// Libellés : calendar.google.target.<value> / <value>Desc.
const TARGET_VALUES: CalendarTarget[] = ['dedicated', 'primary']

type Connection = Extract<GoogleCalendarState, { configured: true }>['connection']

async function api<T>(method: string, path = '', body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; message: string | null }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: string } }) | null
    return { ok: res.ok, status: res.status, data: res.ok ? json : null, message: json?.error?.message ?? null }
  } catch {
    // Réseau indisponible (status 0) : message traduit par l'appelant (calendar.google.network).
    return { ok: false, status: 0, data: null, message: null }
  }
}

function formatDateTime(iso: string | null, locale: string) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: currentTz() }).format(new Date(iso))
  } catch {
    return null
  }
}

function GoogleCalendarSection() {
  const t = useTranslations('calendar.google')
  const tc = useTranslations('calendar.common')
  const f = useCalFormat()
  const locale = useLocale()
  // Traductions lues depuis les callbacks mémorisés (load / drain) sans les recréer.
  const tRef = useRef(t)
  tRef.current = t
  const [state, setState] = useState<GoogleCalendarState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<null | 'connect' | 'save' | 'sync' | 'disconnect'>(null)
  const [target, setTarget] = useState<CalendarTarget>('dedicated')
  const [types, setTypes] = useState<UiEventType[]>([])
  const [mask, setMask] = useState<MaskMode>('sensitive')
  const [progress, setProgress] = useState<number | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const draining = useRef(false)
  // Message d'erreur : celui de l'API, sinon « réseau indisponible » (status 0), sinon le repli fourni.
  const errText = (r: { status: number; message: string | null }, fallback: string) =>
    r.message ?? (r.status === 0 ? t('network') : fallback)

  const applyConnection = (c: Connection) => {
    if (!c) return
    setTarget(c.target)
    setTypes(c.syncTypes)
    setMask(c.maskMode)
  }

  const load = useCallback(async () => {
    const r = await api<GoogleCalendarState>('GET')
    if (!r.ok || !r.data) {
      setLoadError(r.message ?? (r.status === 0 ? tRef.current('network') : tRef.current('loadFailed')))
      return null
    }
    setLoadError(null)
    setState(r.data)
    if (r.data.configured) applyConnection(r.data.connection)
    return r.data
  }, [])

  /** Écoule la file par lots (10 événements par appel) en affichant la progression. */
  const drain = useCallback(async (first: 'process' | 'resync' = 'process') => {
    if (draining.current) return
    draining.current = true
    let action: 'process' | 'resync' = first
    try {
      for (let i = 0; i < 30; i++) {
        const r = await api<SyncResponse>('POST', '/sync', { action })
        action = 'process'
        if (!r.ok || !r.data || r.data.status !== 'processed') {
          if (r.message || r.status === 0) setNotice({ tone: 'error', text: r.message ?? tRef.current('network') })
          break
        }
        setProgress(r.data.remaining)
        if (r.data.reauthRequired || r.data.remaining === 0 || r.data.processed === 0) break
      }
    } finally {
      draining.current = false
      setProgress(null)
      await load()
    }
  }, [load])

  useEffect(() => {
    // Retour de Google : message puis nettoyage de l'URL (le code n'y figure plus, seul ?google=…).
    const code = new URLSearchParams(window.location.search).get('google')
    if (code) {
      const key = code in RETURN_TONES ? code : 'erreur'
      setNotice({ tone: RETURN_TONES[key], text: tRef.current(`return.${key}`) })
      window.history.replaceState(null, '', window.location.pathname)
      if (code === 'connecte') resetGoogleSyncHint()
    }
    void load().then((s) => {
      if (s?.configured && s.connection?.status === 'active' && s.connection.pending > 0) void drain()
    })
  }, [load, drain])

  const connect = async (dest: CalendarTarget = target) => {
    setBusy('connect')
    setNotice(null)
    const r = await api<{ url: string }>('POST', '/connect', { target: dest })
    if (r.ok && r.data?.url) {
      window.location.assign(r.data.url)
      return
    }
    setBusy(null)
    setNotice({ tone: 'error', text: errText(r, t('connectFailed')) })
  }

  const save = async () => {
    if (!state?.configured || !state.connection) return
    setBusy('save')
    setNotice(null)
    const r = await api<{ queued: number }>('PATCH', '', { syncTypes: types, maskMode: mask, target })
    setBusy(null)
    if (r.status === 409 && target !== state.connection.target) {
      // Nouvelle cible non autorisée : on repasse par Google avec la portée adaptée.
      await connect(target)
      return
    }
    if (!r.ok) {
      setNotice({ tone: 'error', text: errText(r, t('saveFailed')) })
      return
    }
    setNotice({ tone: 'ok', text: t('saved') })
    await drain()
  }

  const disconnect = async () => {
    setBusy('disconnect')
    const r = await api<{ revoked: boolean }>('DELETE')
    setBusy(null)
    setConfirmOff(false)
    if (!r.ok) {
      setNotice({ tone: 'error', text: errText(r, t('disconnectFailed')) })
      return
    }
    setNotice({
      tone: 'ok',
      text: r.data?.revoked
        ? t('disconnectedRevoked')
        : t('disconnected'),
    })
    await load()
  }

  const toggleType = (k: UiEventType) => setTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  const conn = state?.configured ? state.connection : null
  const active = conn?.status === 'active'
  const needsReauth = conn?.status === 'reauth_required'
  const targetOptions = TARGET_VALUES.map((value) => ({ value, label: t(`target.${value}`), description: t(`target.${value}Desc`) }))
  const maskOptions = MASK_VALUES.map((value) => ({ value, label: t(`mask.${value}`), description: t(`mask.${value}Desc`) }))

  return (
    <section className="mt-10 border-t border-night-100 pt-6" aria-labelledby="gcal-title" aria-busy={state === null}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 border border-night-100 bg-white shadow-soft">
          <GoogleLogo className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="gcal-title" className="font-display text-base font-bold text-night-900">{t('title')}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-night-500">
            {t('intro')}
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'mt-4 flex items-start gap-2 rounded-xl2 px-3.5 py-3 text-sm font-medium',
              notice.tone === 'ok' ? 'bg-leaf-50 text-leaf-800' : 'bg-alert-50 text-alert-700',
            )}
          >
            {notice.tone === 'ok'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span>{notice.text}</span>
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
        {state === null && !loadError && (
          <p className="flex items-center gap-2 text-sm text-night-600">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> {tc('loading')}
          </p>
        )}

        {loadError && (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-medium text-alert-700">{loadError}</p>
            <Button variant="secondary" onClick={() => void load()}>{tc('retry')}</Button>
          </div>
        )}

        {state && !state.configured && (
          <div className="space-y-2">
            <Badge variant="neutral">{t('notConfigured')}</Badge>
            <p className="text-sm text-night-800">
              {t('notConfiguredText')}
            </p>
            <p className="text-xs leading-relaxed text-night-500">
              {state.mode === 'demo'
                ? t('demoText')
                : t('soonText')}
            </p>
          </div>
        )}

        {state?.configured && !conn && (
          <div className="space-y-4">
            <RadioGroup
              label={t('whereLabel')}
              value={target}
              onChange={(v) => setTarget(v as CalendarTarget)}
              options={targetOptions}
            />
            <p className="flex items-start gap-2 text-xs leading-relaxed text-night-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
              {t('privacyNote')}
            </p>
            <Button full size="lg" onClick={() => void connect()} disabled={busy !== null} aria-busy={busy === 'connect'}>
              <CalendarCheck2 className="h-5 w-5" aria-hidden />
              {busy === 'connect' ? t('redirecting') : t('connect')}
            </Button>
          </div>
        )}

        {conn && needsReauth && (
          <div className="space-y-3">
            <Badge variant="warning">{t('reauthBadge')}</Badge>
            <p className="text-sm text-night-800">
              {t('reauthText')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" onClick={() => void connect(conn.target)} disabled={busy !== null} className="sm:flex-1">
                {busy === 'connect' ? t('redirecting') : t('reconnect')}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setConfirmOff(true)} disabled={busy !== null} className="sm:flex-1">
                {t('disconnect')}
              </Button>
            </div>
          </div>
        )}

        {conn && active && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Badge variant="success" dot>{t('connected')}</Badge>
                <p className="mt-1.5 truncate text-sm font-semibold text-night-900">{conn.googleEmail ?? t('googleAccount')}</p>
                <p className="text-xs text-night-500">
                  {conn.target === 'dedicated' ? t('dedicatedName') : t('primaryName')}
                  {conn.lastSyncAt && t('lastSync', { date: formatDateTime(conn.lastSyncAt, locale) ?? '' })}
                </p>
              </div>
            </div>

            {(progress !== null || conn.pending > 0 || conn.failed > 0) && (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-night-50 px-3 py-2 text-xs text-night-700">
                {progress !== null ? (
                  <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> {t('progress', { count: progress })}</>
                ) : conn.pending > 0 ? (
                  <>{t('pending', { count: conn.pending })}</>
                ) : (
                  <>{t('failed', { count: conn.failed })}</>
                )}
              </p>
            )}

            <fieldset>
              <legend className="text-sm font-semibold text-night-900">{t('typesLegend')}</legend>
              <p className="mt-0.5 text-xs text-night-500">{t('typesHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EVENT_TYPES.map((et) => {
                  const on = types.includes(et.key)
                  return (
                    <button
                      key={et.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleType(et.key)}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors motion-reduce:transition-none',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
                        on ? 'border-leaf-500 bg-leaf-50 text-night-900' : 'border-[#E5E7EB] bg-white text-night-600 hover:border-night-300',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', on ? typeStyle(et.key).dot : 'bg-night-200')} aria-hidden="true" />
                      {f.typeLabel(et.key)}
                    </button>
                  )
                })}
              </div>
              {types.length === 0 && <p className="mt-2 text-xs font-medium text-alert-600">{t('noType')}</p>}
            </fieldset>

            <RadioGroup label={t('privacyLabel')} value={mask} onChange={(v) => setMask(v as MaskMode)} options={maskOptions} />

            <RadioGroup
              label={t('targetLabel')}
              value={target}
              onChange={(v) => setTarget(v as CalendarTarget)}
              options={targetOptions.map((o) => ({
                ...o,
                description: conn.canUse[o.value] || o.value === conn.target ? o.description : t('reauthSuffix', { description: o.description }),
              }))}
              hint={t('targetHint')}
            />

            <div className="flex flex-col gap-2">
              <Button full size="lg" onClick={() => void save()} disabled={busy !== null} aria-busy={busy === 'save'}>
                {busy === 'save' ? tc('saving') : t('saveSync')}
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  size="lg"
                  className="sm:flex-1"
                  disabled={busy !== null || progress !== null}
                  onClick={async () => { setBusy('sync'); setNotice(null); await drain('resync'); setBusy(null) }}
                >
                  <RefreshCw className={cn('h-4 w-4', busy === 'sync' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                  {t('resendAll')}
                </Button>
                <Button variant="secondary" size="lg" className="sm:flex-1 text-alert-600" disabled={busy !== null} onClick={() => setConfirmOff(true)}>
                  {t('disconnect')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={disconnect}
        loading={busy === 'disconnect'}
        title={t('confirmTitle')}
        description={t('confirmDesc')}
        confirmLabel={t('disconnect')}
      />
    </section>
  )
}
