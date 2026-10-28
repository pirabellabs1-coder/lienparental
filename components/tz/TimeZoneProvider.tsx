'use client'
/**
 * Fuseau horaire de l'utilisateur dans le navigateur (lib/tz → currentTz).
 *
 * - Pose le fuseau courant de lib/tz PENDANT le rendu, avant les pages : toutes les
 *   conversions (affichage d'un instant, saisie jour + heure, « aujourd'hui ») le suivent.
 * - `preference` null (jamais choisie) : adopte et enregistre le fuseau de l'appareil, sans
 *   bloquer. "auto" : suit l'appareil (et le signale au serveur pour les rappels hors ligne).
 * - Fuseau fixe différent de celui de l'appareil (voyage, ancien réglage) : bandeau discret
 *   proposant de basculer, une fois par couple (préférence, appareil).
 * - Changement de fuseau : les pages sont remontées (clé) pour recalculer toutes les heures.
 *
 * `fixed` : fuseau imposé, sans détection ni bandeau (l'espace admin utilise FixedTimeZone).
 */
import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Clock3, X } from 'lucide-react'
import { DEFAULT_TZ, deviceTz, setCurrentTz } from '@/lib/tz'
import { TZ_AUTO, isAllowedTz } from '@/lib/timezones'
import { applyTimeZone, reportDeviceTimeZone } from '@/lib/tz-actions'
import { useTzLabel } from './useTzLabel'

const TzContext = createContext<{ tz: string; preference: string | null }>({ tz: DEFAULT_TZ, preference: null })

/** Fuseau effectif de l'utilisateur (composants client). */
export function useTimeZone(): string {
  return useContext(TzContext).tz
}

/** Préférence enregistrée : "auto", un nom IANA, ou null (jamais choisie). */
export function useTimeZonePreference(): string | null {
  return useContext(TzContext).preference
}

const DISMISS_KEY = 'lp-tz-dismissed'

export function TimeZoneProvider({
  initialTz,
  preference,
  fixed = false,
  children,
}: {
  /** Fuseau résolu côté serveur (même valeur au rendu serveur et à l'hydratation). */
  initialTz: string
  /** Préférence brute : "auto", un nom IANA, ou null (jamais choisie). */
  preference: string | null
  fixed?: boolean
  children: React.ReactNode
}) {
  const [device, setDevice] = useState<string | null>(null)
  const follows = !fixed && (preference === null || preference === TZ_AUTO)
  const tz = follows && device ? device : initialTz
  // Avant le rendu des enfants (ordre de rendu React) : idempotent, sans effet côté serveur.
  setCurrentTz(tz)

  useEffect(() => {
    if (fixed) return
    const d = deviceTz()
    if (!d) return
    setDevice(d)
    if (preference === null && isAllowedTz(d)) applyTimeZone(d, d).catch(() => undefined)
    else if (preference === TZ_AUTO && isAllowedTz(d)) reportDeviceTimeZone(d).catch(() => undefined)
  }, [fixed, preference])

  const value = useMemo(() => ({ tz, preference }), [tz, preference])
  const mismatch = !fixed && !follows && device && device !== initialTz && isAllowedTz(device) ? device : null

  return (
    <TzContext.Provider value={value}>
      <Fragment key={tz}>{children}</Fragment>
      {mismatch && <TimeZoneMismatch current={initialTz} device={mismatch} />}
    </TzContext.Provider>
  )
}

function TimeZoneMismatch({ current, device }: { current: string; device: string }) {
  const t = useTranslations('shared.timezones.banner')
  const label = useTzLabel()
  const router = useRouter()
  const pair = `${current}|${device}`
  const [hidden, setHidden] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let dismissed: string | null = null
    try { dismissed = localStorage.getItem(DISMISS_KEY) } catch { /* stockage indisponible */ }
    setHidden(dismissed === pair)
  }, [pair])

  if (hidden) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, pair) } catch { /* ignoré */ }
    setHidden(true)
  }
  const switchTz = async () => {
    setBusy(true)
    try {
      if (await applyTimeZone(device, device)) {
        setHidden(true)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-night-100 bg-white p-4 shadow-[0_12px_40px_-12px_rgba(11,45,91,0.35)] md:bottom-6 md:left-auto md:right-6 md:mx-0"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm text-night-700">
          <p className="font-semibold text-night-900">{t('title')}</p>
          <p className="mt-1">{t('text', { device: label(device), current: label(current) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={switchTz}
              disabled={busy}
              aria-busy={busy}
              className="rounded-full bg-leaf-600 px-4 py-2 text-xs font-semibold text-white hover:bg-leaf-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-700 disabled:opacity-60"
            >
              {t('use', { device: label(device, false) })}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-4 py-2 text-xs font-semibold text-night-600 ring-1 ring-night-200 hover:bg-night-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-700"
            >
              {t('keep', { current: label(current, false) })}
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('close')} className="-m-1 rounded-full p-1 text-night-400 hover:text-night-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf-700">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
