'use client'
/**
 * Notifications sur CET appareil (Web Push) : état, activation, désactivation,
 * liste des autres appareils. La permission du navigateur n'est demandée QUE sur
 * un clic (jamais au chargement de la page). iPhone / iPad : l'application doit
 * d'abord être ajoutée à l'écran d'accueil.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BellRing, Smartphone } from 'lucide-react'
import { btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { DEFAULT_TZ } from '@/lib/tz'
import {
  currentSubscription, disablePushOnThisDevice, enablePushOnThisDevice, listPushDevices, pushSupport, removePushDevice, sha16,
  PushError, type PushDevice, type PushSupport,
} from '@/lib/notify/client'

type State = 'loading' | 'on' | 'off' | 'blocked'

export function PushDeviceCard({ accountPushEnabled }: { accountPushEnabled: boolean }) {
  const t = useTranslations('account.push')
  const locale = useLocale()
  const DATE = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: DEFAULT_TZ })
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [mine, setMine] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = pushSupport()
    setSupport(s)
    if (s !== 'supported') { setState('off'); return }
    if (Notification.permission === 'denied') setState('blocked')
    const sub = await currentSubscription().catch(() => null)
    const hash = sub ? await sha16(sub.endpoint) : null
    setMine(hash)
    const list = await listPushDevices()
    setDevices(list)
    if (Notification.permission !== 'denied') setState(hash && list.some(d => d.endpointHash === hash) ? 'on' : 'off')
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const enable = async () => {
    if (busy || state === 'blocked') return
    setBusy(true); setError(null)
    try {
      await enablePushOnThisDevice()
      await refresh()
    } catch (e) {
      setError(e instanceof PushError ? e.message : t('enableError'))
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setState('blocked')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await disablePushOnThisDevice()
      await refresh()
    } catch {
      setError(t('disableError'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (!(await removePushDevice(id))) setError(t('removeError'))
      await refresh()
    } catch {
      setError(t('removeError'))
    } finally {
      setBusy(false)
    }
  }

  const others = devices.filter(d => d.endpointHash !== mine)

  let status: string
  if (support === null || state === 'loading') status = t('status.checking')
  else if (support === 'demo') status = t('status.demo')
  else if (support === 'not-configured') status = t('status.notConfigured')
  else if (support === 'ios-needs-install') status = t('status.iosInstall')
  else if (support === 'unsupported') status = t('status.unsupported')
  else if (state === 'blocked') status = t('status.blocked')
  else if (state === 'on') status = accountPushEnabled ? t('status.on') : t('status.onAccountOff')
  else status = t('status.off')

  return (
    <section aria-labelledby="push-device-title" className="mt-2 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', state === 'on' ? 'bg-leaf-50 text-leaf-600' : 'bg-night-50 text-night-600')}>
          <BellRing className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="push-device-title" className="text-[14px] font-bold text-night-900">{t('title')}</h2>
          <p role="status" aria-live="polite" className="mt-0.5 text-[13px] text-night-700">{status}</p>
        </div>
      </div>

      {support === 'ios-needs-install' && (
        <p className="mt-3 rounded-xl bg-night-50 px-3 py-2.5 text-[13px] leading-5 text-night-800">
          {t('iosHelp')}
        </p>
      )}

      {support === 'supported' && state !== 'loading' && (
        state === 'on' ? (
          <button type="button" onClick={disable} aria-disabled={busy} aria-busy={busy} className={cn(btn.secondary, 'mt-4', busy && 'cursor-not-allowed opacity-50')}>
            {busy ? t('busy') : t('disable')}
          </button>
        ) : (
          <button type="button" onClick={enable} aria-disabled={busy || state === 'blocked'} aria-busy={busy} className={cn(btn.primary, 'mt-4', (busy || state === 'blocked') && 'cursor-not-allowed opacity-50')}>
            {busy ? t('enabling') : t('enable')}
          </button>
        )
      )}

      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-alert-600">{error}</p>}

      {others.length > 0 && (
        <div className="mt-4 border-t border-night-100 pt-3">
          <h3 className="text-[13px] font-bold text-night-900">{t('others')}</h3>
          <ul className="mt-1 divide-y divide-night-100">
            {others.map(d => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <Smartphone aria-hidden className="h-4 w-4 shrink-0 text-night-600" />
                <span className="min-w-0 flex-1 text-[13px] text-night-800">
                  {d.label}
                  <span className="block text-[12px] text-night-600">{t('since', { date: DATE.format(new Date(d.createdAt)) })}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  aria-disabled={busy}
                  className={cn('min-h-[44px] rounded-lg px-3 text-[13px] font-semibold text-alert-600 hover:bg-alert-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', busy && 'cursor-not-allowed opacity-50')}
                  aria-label={t('removeAria', { label: d.label })}
                >
                  {t('remove')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
