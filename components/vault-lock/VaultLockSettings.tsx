'use client'
/**
 * Réglages du verrou du coffre-fort (Profil > Sécurité > Coffre-fort).
 * Chaque action est revérifiée côté serveur (coffre déverrouillé, preuve du code
 * actuel ou du mot de passe) ; l'interface ne fait qu'afficher le nouvel état renvoyé.
 */
import { useEffect, useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Fingerprint, KeyRound, Lock, LockKeyhole, ShieldCheck, ShieldOff, Smartphone, Timer, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { LabeledInput, LabeledSelect, PasswordField } from '@/components/profil/fields'
import { Banner, SectionTitle, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { BACKGROUND_OPTIONS, PIN_REGEX, TIMEOUT_OPTIONS, isWeakPin, type VaultStatus } from '@/lib/vault-lock/config'
import { VaultApiError, isWebauthnServerUnavailable, vaultApi } from './api'
import { useVault } from './VaultGate'
import { WebauthnError, guessDeviceName, platformAuthenticatorAvailable, webauthnErrorMessage, webauthnSupported } from './webauthn-browser'

type Tr = (key: string, values?: Record<string, string | number>) => string

/** Message d'erreur affiché : serveur tel quel ; erreurs produites côté navigateur traduites. */
function message(e: unknown, te: Tr): string {
  if (e instanceof VaultApiError) return e.code === 'network' ? te('network') : e.message
  if (e instanceof WebauthnError) return webauthnErrorMessage(e, (k) => te(`webauthn.${k}`))
  return te('generic')
}

const cardCls = 'rounded-xl2 border border-night-100 bg-white p-4 shadow-soft'

export function VaultLockSettings() {
  const t = useTranslations('vault.lock.settings')
  const te = useTranslations('vault.lock.errors')
  const tc = useTranslations('vault.common')
  const { status, setStatus, lock } = useVault()
  const { announce, node: toast } = useAnnounce()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<VaultStatus>, ok: string) => {
    setBusy(key)
    setError(null)
    try {
      setStatus(await fn())
      announce(ok)
      return true
    } catch (e) {
      if (e instanceof VaultApiError && e.code === 'vault_locked') lock('expired')
      else setError(message(e, te))
      return false
    } finally {
      setBusy(null)
    }
  }

  const toggle = () =>
    run('toggle', () => vaultApi.updateSettings({ enabled: !status.enabled }), status.enabled ? t('toggleOff') : t('toggleOn'))

  // Serveur sans VAULT_LOCK_SECRET (ou sans clé service) : le coffre est ouvert sans verrou,
  // aucun réglage ne peut être enregistré. On l'explique plutôt que d'afficher des commandes inopérantes.
  if (status.notConfigured) {
    return (
      <>
        <TopBar title={tc('vault')} showBack backHref="/app/profil/securite" showBell={false} />
        <div className="space-y-5 px-5 pb-10 pt-3 lg:mx-auto lg:max-w-2xl">
          <Banner tone="warm" className="py-5" icon={<ShieldOff className="h-8 w-8" strokeWidth={1.8} />} title={t('notConfiguredTitle')}>
            {t('notConfiguredText')}
          </Banner>
          <p className="text-[13px] leading-relaxed text-night-700">
            {t('notConfiguredHelp')}
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title={tc('vault')} showBack backHref="/app/profil/securite" showBell={false} />
      <div className="space-y-7 px-5 pb-10 pt-3 lg:mx-auto lg:max-w-2xl">
        <Banner
          tone={status.enabled ? 'green' : 'warm'}
          className="py-5"
          icon={status.enabled ? <ShieldCheck className="h-8 w-8" strokeWidth={1.8} /> : <ShieldOff className="h-8 w-8" strokeWidth={1.8} />}
          title={status.enabled ? t('protectedTitle') : t('unprotectedTitle')}
        >
          {status.enabled
            ? t('protectedText', { minutes: status.timeoutMinutes })
            : t('unprotectedText')}
        </Banner>

        {error && <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50 px-4 py-3 text-[13.5px] font-semibold text-alert-700">{error}</p>}

        <section aria-labelledby="vl-main">
          <SectionTitle id="vl-main">{t('lockSection')}</SectionTitle>
          <div className={cn(cardCls, 'flex items-center gap-3')}>
            <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><LockKeyhole className="h-6 w-6" strokeWidth={1.7} /></span>
            <div className="min-w-0 flex-1">
              <p id="vl-switch-label" className="text-[14px] font-bold text-night-900">{t('switchLabel')}</p>
              <p id="vl-switch-desc" className="mt-0.5 text-[12.5px] leading-snug text-night-600">{t('switchDesc')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={status.enabled}
              aria-labelledby="vl-switch-label"
              aria-describedby="vl-switch-desc"
              disabled={busy !== null}
              onClick={toggle}
              className={cn(
                'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-60',
                'before:absolute before:-inset-2 before:content-[""]',
                status.enabled ? 'bg-leaf-500' : 'bg-night-200',
              )}
            >
              <span aria-hidden="true" className={cn('inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none', status.enabled ? 'translate-x-7' : 'translate-x-1')} />
            </button>
          </div>
        </section>

        <section aria-labelledby="vl-methods">
          <SectionTitle id="vl-methods">{t('methods')}</SectionTitle>
          <div className="space-y-3">
            <PinCard status={status} busy={busy} run={run} />
            <div className={cn(cardCls, 'flex items-start gap-3')}>
              <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><KeyRound className="h-6 w-6" strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-night-900">{t('passwordTitle')}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">
                  {status.hasPassword
                    ? t('passwordAvailable')
                    : t('passwordUnavailable')}
                </p>
              </div>
            </div>
            <PasskeysCard status={status} busy={busy} run={run} />
          </div>
        </section>

        <section aria-labelledby="vl-delays">
          <SectionTitle id="vl-delays">{t('delays')}</SectionTitle>
          <div className={cn(cardCls, 'space-y-5')}>
            <LabeledSelect
              label={t('timeoutLabel')}
              value={String(status.timeoutMinutes)}
              disabled={busy !== null || !status.enabled}
              onChange={(e) => void run('timeout', () => vaultApi.updateSettings({ timeoutMinutes: Number(e.target.value) }), t('delaySaved'))}
              options={TIMEOUT_OPTIONS.map((m) => ({ value: String(m), label: t('minutes', { n: m }) }))}
            />
            <LabeledSelect
              label={t('backgroundLabel')}
              value={String(status.backgroundSeconds)}
              disabled={busy !== null || !status.enabled}
              onChange={(e) => void run('background', () => vaultApi.updateSettings({ backgroundSeconds: Number(e.target.value) }), t('settingSaved'))}
              options={BACKGROUND_OPTIONS.map((s) => ({ value: String(s), label: s === 0 ? t('lockNow') : t('lockAfter', { n: s / 60 }) }))}
            />
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-night-600">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
              {t('maxDuration')}
            </p>
          </div>
        </section>

        {status.enabled && (
          <button type="button" onClick={() => lock('manual')} className={btn.secondary}>
            <Lock className="h-5 w-5 text-leaf-600" aria-hidden="true" /> {t('lockNowButton')}
          </button>
        )}
        {status.demo && (
          <p className="text-center text-[12px] text-night-600">{t('demo')}</p>
        )}
      </div>
      {toast}
    </>
  )
}

type CardProps = {
  status: VaultStatus
  busy: string | null
  run: (key: string, fn: () => Promise<VaultStatus>, ok: string) => Promise<boolean>
}

/* ------------------------------------------------------------------ */
/* Code à 6 chiffres                                                   */
/* ------------------------------------------------------------------ */

function PinCard({ status, busy, run }: CardProps) {
  const t = useTranslations('vault.lock.settings.pin')
  const tc = useTranslations('vault.common')
  const [open, setOpen] = useState(false)
  const [useAccountPassword, setUseAccountPassword] = useState(false)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ current?: string; pin?: string; confirm?: string }>({})
  const formId = useId()

  const needsProof = status.hasPin
  const reset = () => { setCurrent(''); setPassword(''); setPin(''); setConfirm(''); setErrors({}); setUseAccountPassword(false) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (needsProof && !useAccountPassword && !PIN_REGEX.test(current)) next.current = t('currentRequired')
    if (needsProof && useAccountPassword && !password) next.current = t('passwordRequired')
    if (!PIN_REGEX.test(pin)) next.pin = t('invalid')
    else if (isWeakPin(pin) && !status.demo) next.pin = t('weak')
    if (!next.pin && confirm !== pin) next.confirm = t('mismatch')
    setErrors(next)
    if (Object.keys(next).length) return
    const ok = await run('pin', () => vaultApi.setPin({
      pin,
      currentPin: needsProof && !useAccountPassword ? current : undefined,
      password: needsProof && useAccountPassword ? password : undefined,
    }), status.hasPin ? t('changed') : t('saved'))
    if (ok) { reset(); setOpen(false) }
  }

  const digitProps = { inputMode: 'numeric' as const, pattern: '[0-9]*', maxLength: 6, autoComplete: 'off' }

  return (
    <div className={cardCls}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><LockKeyhole className="h-6 w-6" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-night-900">{t('title')}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">{status.hasPin ? t('defined') : t('none')}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => { reset(); setOpen(true) }}
            aria-expanded={false}
            aria-controls={formId}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-[13.5px] font-bold text-leaf-700 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          >
            {status.hasPin ? t('edit') : t('set')}
          </button>
        )}
      </div>

      {open && (
        <form id={formId} onSubmit={submit} noValidate className="mt-4 space-y-4 border-t border-night-100 pt-4">
          {needsProof && (useAccountPassword ? (
            <PasswordField label={t('accountPassword')} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.current} autoFocus />
          ) : (
            <PasswordField label={t('current')} {...digitProps} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))} error={errors.current} autoFocus />
          ))}
          {needsProof && status.hasPassword && (
            <button type="button" onClick={() => { setUseAccountPassword((v) => !v); setErrors({}) }} className="min-h-[44px] rounded-lg text-left text-[13px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
              {useAccountPassword ? t('useCurrent') : t('forgot')}
            </button>
          )}
          <PasswordField label={t('new')} {...digitProps} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={errors.pin} autoFocus={!needsProof} />
          <PasswordField label={t('confirm')} {...digitProps} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} error={errors.confirm} />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="submit" disabled={busy === 'pin'} aria-busy={busy === 'pin'} className={btn.primary}>
              {busy === 'pin' ? t('saving') : t('save')}
            </button>
            <button type="button" onClick={() => { reset(); setOpen(false) }} className={btn.secondary}>{tc('cancel')}</button>
          </div>
        </form>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empreinte / visage                                                  */
/* ------------------------------------------------------------------ */

function PasskeysCard({ status, busy, run }: CardProps) {
  const t = useTranslations('vault.lock.settings.passkeys')
  const te = useTranslations('vault.lock.errors')
  const tc = useTranslations('vault.common')
  const locale = useLocale()
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' })
  const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '')
  const [name, setName] = useState(() => t('thisDevice'))
  const [adding, setAdding] = useState(false)
  const [platform, setPlatform] = useState<boolean | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    setName(guessDeviceName({ thisDevice: t('thisDevice'), android: t('android'), windows: t('windows') }))
    void platformAuthenticatorAvailable().then(setPlatform)
  }, [t])

  const canSimulate = status.demo
  const canUseReal = platform === true
  const available = canUseReal || canSimulate

  const register = async () => {
    const label = name.trim() || t('thisDevice')
    const ok = await run('passkey-add', async () => {
      if (!canUseReal || !webauthnSupported()) return vaultApi.simulateRegister(label)
      try {
        return await vaultApi.registerPasskey(label)
      } catch (e) {
        if (canSimulate && isWebauthnServerUnavailable(e)) return vaultApi.simulateRegister(label)
        if (isWebauthnServerUnavailable(e)) throw new VaultApiError(503, 'webauthn_unavailable', te('webauthnServer'))
        throw e
      }
    }, t('registered'))
    if (ok) setAdding(false)
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><Fingerprint className="h-6 w-6" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-night-900">{t('title')}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">{t('subtitle')}</p>
        </div>
      </div>

      {status.passkeys.length > 0 && (
        <ul className="mt-3 divide-y divide-night-100 border-t border-night-100" aria-label={t('list')}>
          {status.passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <Smartphone className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-night-900">{p.name}{p.simulated ? t('simulated') : ''}</p>
                <p className="text-[12px] text-night-600">
                  {t('added', { date: fmt(p.createdAt) })}{p.lastUsedAt ? t('used', { date: fmt(p.lastUsedAt) }) : ''}{p.synced ? t('synced') : ''}
                </p>
              </div>
              {confirmId === p.id ? (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run('passkey-del', () => vaultApi.deletePasskey(p.id), t('removed')).then(() => setConfirmId(null))}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-alert-500 px-3 text-[12.5px] font-bold text-white hover:bg-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-300"
                  >
                    {t('remove')}
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[12.5px] font-semibold text-night-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                    {tc('cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  aria-label={t('removeAria', { name: p.name })}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-alert-600 hover:bg-alert-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-300"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-night-100 pt-3">
        {platform === false && !canSimulate && (
          <p className="text-[12.5px] leading-relaxed text-night-600">{t('unsupported')}</p>
        )}
        {available && !adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={busy !== null} className={btn.secondary}>
            <Fingerprint className="h-5 w-5 text-leaf-600" aria-hidden="true" /> {t('add')}
          </button>
        )}
        {available && adding && (
          <div className="space-y-3">
            <LabeledInput label={t('nameLabel')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
            {!canUseReal && canSimulate && (
              <p className="text-[12px] text-night-600">{t('demo')}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" onClick={register} disabled={busy === 'passkey-add'} aria-busy={busy === 'passkey-add'} className={btn.primary}>
                {busy === 'passkey-add' ? t('waiting') : t('save')}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={btn.secondary}>{tc('cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
