'use client'
/**
 * Écran « Coffre-fort sécurisé » : code à 6 chiffres, empreinte / visage, mot de passe du compte.
 * Le déverrouillage est TOUJOURS décidé par le serveur (cookie HttpOnly signé) ;
 * cet écran ne fait que recueillir le facteur et afficher la réponse.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { Logo } from '@/components/brand/Logo'
import { PasswordField } from '@/components/profil/fields'
import { btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import type { VaultStatus } from '@/lib/vault-lock/config'
import { VaultApiError, isWebauthnServerUnavailable, vaultApi } from './api'
import { PinPad, type PinPadHandle } from './PinPad'
import { WebauthnError, webauthnErrorMessage, webauthnSupported } from './webauthn-browser'

type Mode = 'pin' | 'password' | 'setup'

type Props = {
  status: VaultStatus
  onUnlocked: (s: VaultStatus) => void
  /** Texte d'accompagnement (ex. réglages). */
  context?: 'coffre' | 'settings'
  /** Message affiché après un verrouillage automatique. */
  notice?: string | null
  /**
   * Lancer l'empreinte dès l'affichage (empreinte enregistrée) : à l'arrivée sur le coffre ou au retour
   * sur l'appli, pas après un verrouillage volontaire. Refuser l'invite laisse simplement le code.
   */
  autoBiometric?: boolean
}

function initialMode(s: VaultStatus): Mode {
  if (s.hasPin) return 'pin'
  if (s.hasPassword) return 'password'
  return s.passkeys.length > 0 ? 'pin' : 'setup'
}

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until || until <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }
}

export function VaultUnlockScreen({ status, onUnlocked, context = 'coffre', notice, autoBiometric = false }: Props) {
  const t = useTranslations('vault.lock.unlock')
  const te = useTranslations('vault.lock.errors')
  const tc = useTranslations('vault.common')
  const [mode, setMode] = useState<Mode>(() => initialMode(status))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(() =>
    status.pinLockedUntil && status.pinLockedUntil > Date.now() ? t('tooManyAttempts') : null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(status.pinLockedUntil)
  const [password, setPassword] = useState('')
  const [setupFirst, setSetupFirst] = useState<string | null>(null)
  const [bioAvailable, setBioAvailable] = useState(false)
  // Compte Google sans mot de passe : choisir un code exige une reconnexion de moins de 5 minutes
  // (serveur, /api/vault-lock/pin). On la propose AVANT la saisie plutôt qu'un refus après coup.
  const [reauth, setReauth] = useState(() => !status.hasPassword && !status.recentLogin && !status.demo)
  const pathname = usePathname()
  const pinRef = useRef<PinPadHandle>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const errId = useId()
  const { left, label: countdown } = useCountdown(lockedUntil)
  const pinBlocked = mode === 'pin' && lockedUntil !== null && left > 0

  useEffect(() => {
    // Après un verrouillage automatique, le focus revient sur le titre (annoncé par les lecteurs d'écran).
    if (notice) headingRef.current?.focus()
  }, [notice])

  useEffect(() => {
    // Empreinte proposée si une clé existe et que le navigateur sait faire (ou démo : simulation).
    setBioAvailable(status.passkeys.length > 0 && (webauthnSupported() || status.demo))
  }, [status.passkeys.length, status.demo])

  useEffect(() => {
    if (lockedUntil && left === 0) { setLockedUntil(null); setError(null) }
  }, [left, lockedUntil])

  const fail = useCallback((e: unknown) => {
    if (e instanceof VaultApiError) {
      if (e.code === 'locked_out' && e.details.lockedUntil) setLockedUntil(e.details.lockedUntil)
      setError(e.code === 'network' ? te('network') : e.message)
    } else if (e instanceof WebauthnError) {
      setError(e.kind === 'cancelled' ? t('bioCancelled') : webauthnErrorMessage(e, (k) => te(`webauthn.${k}`)))
    } else {
      setError(te('generic'))
    }
  }, [t, te])

  const submitPin = useCallback(async (pin: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      onUnlocked(await vaultApi.unlockPin(pin))
    } catch (e) {
      fail(e)
      pinRef.current?.clear()
      pinRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }, [busy, fail, onUnlocked])

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return setError(t('enterPassword'))
    setBusy(true)
    setError(null)
    try {
      onUnlocked(await vaultApi.unlockPassword(password))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const submitSetup = useCallback(async (pin: string) => {
    if (!setupFirst) {
      setSetupFirst(pin)
      setError(null)
      pinRef.current?.clear()
      return
    }
    if (pin !== setupFirst) {
      setSetupFirst(null)
      pinRef.current?.clear()
      setError(t('mismatch'))
      return
    }
    setBusy(true)
    try {
      onUnlocked(await vaultApi.setPin({ pin }))
    } catch (e) {
      setSetupFirst(null)
      pinRef.current?.clear()
      if (e instanceof VaultApiError && e.code === 'reauth_required') setReauth(true)
      fail(e)
    } finally {
      setBusy(false)
    }
  }, [fail, onUnlocked, setupFirst, t])

  const unlockWithBiometric = async (auto = false) => {
    setBusy(true)
    setError(null)
    try {
      const hasReal = status.passkeys.some((p) => !p.simulated)
      if (status.demo && (!hasReal || !webauthnSupported())) {
        onUnlocked(await vaultApi.simulateAuthenticate())
      } else {
        try {
          onUnlocked(await vaultApi.authenticatePasskey())
        } catch (e) {
          if (status.demo && isWebauthnServerUnavailable(e)) onUnlocked(await vaultApi.simulateAuthenticate())
          else throw e
        }
      }
    } catch (e) {
      // Invite automatique refusée ou bloquée par le navigateur (pas de geste) : aucun message, le code reste là.
      if (auto && e instanceof WebauthnError && e.kind === 'cancelled') {
        pinRef.current?.focus()
        return
      }
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // Empreinte proposée d'elle-même à l'arrivée, une seule fois par affichage (StrictMode monte deux fois).
  const autoTried = useRef(false)
  const hasRealPasskey = status.passkeys.some((p) => !p.simulated)
  useEffect(() => {
    if (!autoBiometric || autoTried.current || status.demo || !hasRealPasskey || !webauthnSupported()) return
    if (initialMode(status) !== 'pin' || (status.pinLockedUntil ?? 0) > Date.now()) return
    if (document.visibilityState !== 'visible') return
    autoTried.current = true
    void unlockWithBiometric(true)
    // Au montage uniquement : `unlockWithBiometric` change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBiometric, hasRealPasskey, status.demo])

  const switchTo = (m: Mode) => {
    setMode(m)
    setError(null)
    setPassword('')
  }

  const intro =
    mode === 'setup'
      ? reauth ? t('introReauth') : setupFirst ? t('introConfirm') : t('introSetup')
      : mode === 'password'
        ? t('introPassword')
        : context === 'settings'
          ? t('introSettings')
          : t('introPin')

  const bioButton = bioAvailable && mode === 'pin' ? (
    <button
      type="button"
      onClick={() => void unlockWithBiometric()}
      disabled={busy}
      aria-label={t('bioAria')}
      title={t('bioButton')}
      className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-full bg-leaf-50 text-leaf-600 ring-1 ring-leaf-200 transition-colors hover:bg-leaf-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-40 sm:h-16 sm:w-16"
    >
      <Fingerprint className="h-8 w-8" aria-hidden="true" />
    </button>
  ) : null

  return (
    <section aria-labelledby="vault-lock-title" className="flex min-h-[calc(100dvh-6rem)] w-full flex-col px-5 pb-8 lg:min-h-[calc(100dvh-8rem)]">
      <header className="flex items-center" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
        <Link href="/app" aria-label={tc('homeAria')} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 md:invisible">
          <Logo size="sm" />
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center pt-3 text-center lg:justify-center lg:pt-0">
        <div aria-hidden="true" className="relative">
          <span className="absolute inset-0 -m-3 rounded-full bg-leaf-50 motion-safe:animate-pulse-slow" />
          <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-night-900 text-white shadow-[0_14px_30px_-12px_rgba(11,45,91,0.55)]">
            <LockKeyhole className="h-8 w-8" strokeWidth={1.8} />
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-leaf-400 ring-4 ring-white">
              <ShieldCheck className="h-4 w-4 text-white" strokeWidth={2.4} />
            </span>
          </span>
        </div>

        <h1 id="vault-lock-title" ref={headingRef} tabIndex={-1} className="mt-6 text-[24px] font-extrabold tracking-[-0.02em] text-night-900 focus:outline-none">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-night-600">{intro}</p>
        {notice && (
          <p className="mt-3 rounded-full bg-night-50 px-3 py-1 text-[12.5px] font-semibold text-night-700">{notice}</p>
        )}

        <div className="mt-4 w-full">
          {(mode === 'pin' || mode === 'setup') && (
            <>
              {mode === 'setup' && reauth ? (
                <GoogleButton next={pathname ?? '/app/coffre'} />
              ) : mode === 'pin' && !status.hasPin ? (
                // Ni code ni mot de passe, mais une empreinte : seul le bouton empreinte est proposé.
                <button type="button" onClick={() => void unlockWithBiometric()} disabled={busy} className={btn.primary}>
                  <Fingerprint className="h-5 w-5" aria-hidden="true" /> {t('useBio')}
                </button>
              ) : (
                <PinPad
                  key={mode + (setupFirst ? '-confirm' : '')}
                  ref={pinRef}
                  label={mode === 'setup' ? (setupFirst ? t('pinConfirmLabel') : t('pinNewLabel')) : t('pinLabel')}
                  onComplete={mode === 'setup' ? submitSetup : submitPin}
                  disabled={busy || pinBlocked}
                  error={Boolean(error)}
                  describedBy={error ? errId : undefined}
                  extraKey={bioButton}
                />
              )}
            </>
          )}

          {mode === 'password' && (
            <form onSubmit={submitPassword} className="space-y-4 text-left" noValidate>
              <PasswordField
                label={t('accountPassword')}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                aria-describedby={error ? errId : undefined}
              />
              <button type="submit" disabled={busy} aria-busy={busy} className={btn.primary}>
                <KeyRound className="h-5 w-5" aria-hidden="true" />
                {busy ? t('checking') : t('unlock')}
              </button>
            </form>
          )}

          <div className="mt-3 min-h-[1.5rem]">
            {error && (
              <p id={errId} role="alert" className="text-[13.5px] font-semibold text-alert-600">
                {error}
                {pinBlocked && <span className="mt-1 block font-bold tabular-nums" aria-hidden="true">{countdown}</span>}
              </p>
            )}
            {!error && busy && mode !== 'password' && <p role="status" className="text-[13px] text-night-600">{t('checking')}</p>}
          </div>
        </div>

        <div className="mt-2 flex w-full flex-col items-center gap-1">
          {bioAvailable && mode === 'pin' && status.hasPin && (
            <button type="button" onClick={() => void unlockWithBiometric()} disabled={busy} className={cn(btn.secondary, 'mb-2')}>
              <Fingerprint className="h-5 w-5 text-leaf-600" aria-hidden="true" /> {t('bioButton')}
            </button>
          )}
          {mode === 'pin' && status.hasPassword && (
            <button type="button" onClick={() => switchTo('password')} className="min-h-[44px] rounded-lg px-3 text-[13.5px] font-semibold text-leaf-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
              {pinBlocked ? t('usePassword') : t('forgotPassword')}
            </button>
          )}
          {mode === 'password' && status.hasPin && (
            <button type="button" onClick={() => switchTo('pin')} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('backToCode')}
            </button>
          )}
          {mode === 'pin' && !status.hasPassword && status.hasPin && (status.recentLogin ? (
            <button type="button" onClick={() => { setSetupFirst(null); switchTo('setup') }} className="min-h-[44px] rounded-lg px-3 text-[13.5px] font-semibold text-leaf-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
              {t('forgotReset')}
            </button>
          ) : (
            <p className="max-w-[300px] text-[12.5px] leading-relaxed text-night-600">
              {t('forgotRelogin')}
            </p>
          ))}
        </div>

        <p className="mt-auto flex items-center gap-1.5 pt-6 text-[12px] text-night-600">
          <ShieldCheck className="h-4 w-4 text-leaf-500" aria-hidden="true" />
          {t('autoLock', { minutes: status.timeoutMinutes })}
        </p>
        {status.demo && (
          <p className="mt-2 text-[11.5px] text-night-500">{t('demo')}</p>
        )}
      </div>
    </section>
  )
}
