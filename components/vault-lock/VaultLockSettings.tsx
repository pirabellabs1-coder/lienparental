'use client'
/**
 * Réglages du verrou du coffre-fort (Profil > Sécurité > Coffre-fort).
 * Chaque action est revérifiée côté serveur (coffre déverrouillé, preuve du code
 * actuel ou du mot de passe) ; l'interface ne fait qu'afficher le nouvel état renvoyé.
 */
import { useEffect, useId, useState } from 'react'
import { Fingerprint, KeyRound, Lock, LockKeyhole, ShieldCheck, ShieldOff, Smartphone, Timer, Trash2 } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { LabeledInput, LabeledSelect, PasswordField } from '@/components/profil/fields'
import { Banner, SectionTitle, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { BACKGROUND_OPTIONS, PIN_REGEX, TIMEOUT_OPTIONS, isWeakPin, type VaultStatus } from '@/lib/vault-lock/config'
import { VaultApiError, isWebauthnServerUnavailable, vaultApi } from './api'
import { useVault } from './VaultGate'
import { WebauthnError, guessDeviceName, platformAuthenticatorAvailable, webauthnSupported } from './webauthn-browser'

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : null)

function message(e: unknown): string {
  if (e instanceof VaultApiError || e instanceof WebauthnError) return e.message
  return 'Une erreur est survenue. Réessayez.'
}

const cardCls = 'rounded-xl2 border border-night-100 bg-white p-4 shadow-soft'

export function VaultLockSettings() {
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
      else setError(message(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  const toggle = () =>
    run('toggle', () => vaultApi.updateSettings({ enabled: !status.enabled }), status.enabled ? 'Verrouillage désactivé.' : 'Verrouillage activé.')

  // Serveur sans VAULT_LOCK_SECRET (ou sans clé service) : le coffre est ouvert sans verrou,
  // aucun réglage ne peut être enregistré. On l'explique plutôt que d'afficher des commandes inopérantes.
  if (status.notConfigured) {
    return (
      <>
        <TopBar title="Coffre-fort" showBack backHref="/app/profil/securite" showBell={false} />
        <div className="space-y-5 px-5 pb-10 pt-3 lg:mx-auto lg:max-w-2xl">
          <Banner tone="warm" className="py-5" icon={<ShieldOff className="h-8 w-8" strokeWidth={1.8} />} title="Verrouillage non configuré">
            Le verrouillage du coffre-fort n’est pas encore disponible sur ce service. Vos documents et témoignages restent accessibles avec votre session habituelle, sans code supplémentaire.
          </Banner>
          <p className="text-[13px] leading-relaxed text-night-700">
            Pour protéger l’accès à votre coffre-fort en attendant, verrouillez votre téléphone et déconnectez-vous des appareils partagés. Le réglage apparaîtra ici dès son activation.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Coffre-fort" showBack backHref="/app/profil/securite" showBell={false} />
      <div className="space-y-7 px-5 pb-10 pt-3 lg:mx-auto lg:max-w-2xl">
        <Banner
          tone={status.enabled ? 'green' : 'warm'}
          className="py-5"
          icon={status.enabled ? <ShieldCheck className="h-8 w-8" strokeWidth={1.8} /> : <ShieldOff className="h-8 w-8" strokeWidth={1.8} />}
          title={status.enabled ? 'Votre coffre-fort est protégé' : 'Votre coffre-fort n’est pas verrouillé'}
        >
          {status.enabled
            ? `Un code, votre empreinte ou votre mot de passe est demandé avant d’ouvrir vos documents et témoignages. Verrouillage automatique après ${status.timeoutMinutes} min d’inactivité.`
            : 'Toute personne ayant accès à votre téléphone ou à votre session peut ouvrir vos documents. Nous vous conseillons d’activer le verrou.'}
        </Banner>

        {error && <p role="alert" className="rounded-xl2 border border-alert-100 bg-alert-50 px-4 py-3 text-[13.5px] font-semibold text-alert-700">{error}</p>}

        <section aria-labelledby="vl-main">
          <SectionTitle id="vl-main">Verrouillage</SectionTitle>
          <div className={cn(cardCls, 'flex items-center gap-3')}>
            <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><LockKeyhole className="h-6 w-6" strokeWidth={1.7} /></span>
            <div className="min-w-0 flex-1">
              <p id="vl-switch-label" className="text-[14px] font-bold text-night-900">Verrouiller le coffre-fort</p>
              <p id="vl-switch-desc" className="mt-0.5 text-[12.5px] leading-snug text-night-600">Demander un code ou l’empreinte à chaque ouverture</p>
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
          <SectionTitle id="vl-methods">Méthodes de déverrouillage</SectionTitle>
          <div className="space-y-3">
            <PinCard status={status} busy={busy} run={run} />
            <div className={cn(cardCls, 'flex items-start gap-3')}>
              <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><KeyRound className="h-6 w-6" strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-night-900">Mot de passe du compte</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">
                  {status.hasPassword
                    ? 'Toujours disponible, y compris si vous oubliez votre code.'
                    : 'Indisponible : vous vous connectez avec Google. En cas d’oubli du code, reconnectez-vous pour le redéfinir.'}
                </p>
              </div>
            </div>
            <PasskeysCard status={status} busy={busy} run={run} />
          </div>
        </section>

        <section aria-labelledby="vl-delays">
          <SectionTitle id="vl-delays">Délais</SectionTitle>
          <div className={cn(cardCls, 'space-y-5')}>
            <LabeledSelect
              label="Verrouiller après une inactivité de"
              value={String(status.timeoutMinutes)}
              disabled={busy !== null || !status.enabled}
              onChange={(e) => void run('timeout', () => vaultApi.updateSettings({ timeoutMinutes: Number(e.target.value) }), 'Délai enregistré.')}
              options={TIMEOUT_OPTIONS.map((m) => ({ value: String(m), label: `${m} minute${m > 1 ? 's' : ''}` }))}
            />
            <LabeledSelect
              label="Quand l’application passe en arrière-plan"
              value={String(status.backgroundSeconds)}
              disabled={busy !== null || !status.enabled}
              onChange={(e) => void run('background', () => vaultApi.updateSettings({ backgroundSeconds: Number(e.target.value) }), 'Réglage enregistré.')}
              options={BACKGROUND_OPTIONS.map((s) => ({ value: String(s), label: s === 0 ? 'Verrouiller immédiatement' : `Verrouiller après ${s / 60} minute${s > 60 ? 's' : ''}` }))}
            />
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-night-600">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
              Le déverrouillage dure au plus 8 heures, même en utilisation continue.
            </p>
          </div>
        </section>

        {status.enabled && (
          <button type="button" onClick={() => lock('manual')} className={btn.secondary}>
            <Lock className="h-5 w-5 text-leaf-600" aria-hidden="true" /> Verrouiller maintenant
          </button>
        )}
        {status.demo && (
          <p className="text-center text-[12px] text-night-600">Démonstration : code 123456, empreinte simulée si l’appareil ne la propose pas.</p>
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
    if (needsProof && !useAccountPassword && !PIN_REGEX.test(current)) next.current = 'Saisissez votre code actuel (6 chiffres).'
    if (needsProof && useAccountPassword && !password) next.current = 'Saisissez le mot de passe de votre compte.'
    if (!PIN_REGEX.test(pin)) next.pin = 'Le code comporte exactement 6 chiffres.'
    else if (isWeakPin(pin) && !status.demo) next.pin = 'Ce code est trop simple. Évitez les chiffres identiques ou qui se suivent.'
    if (!next.pin && confirm !== pin) next.confirm = 'Les deux codes ne correspondent pas.'
    setErrors(next)
    if (Object.keys(next).length) return
    const ok = await run('pin', () => vaultApi.setPin({
      pin,
      currentPin: needsProof && !useAccountPassword ? current : undefined,
      password: needsProof && useAccountPassword ? password : undefined,
    }), status.hasPin ? 'Code modifié.' : 'Code enregistré.')
    if (ok) { reset(); setOpen(false) }
  }

  const digitProps = { inputMode: 'numeric' as const, pattern: '[0-9]*', maxLength: 6, autoComplete: 'off' }

  return (
    <div className={cardCls}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><LockKeyhole className="h-6 w-6" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-night-900">Code à 6 chiffres</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">{status.hasPin ? 'Défini' : 'Aucun code défini'}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => { reset(); setOpen(true) }}
            aria-expanded={false}
            aria-controls={formId}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-[13.5px] font-bold text-leaf-700 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          >
            {status.hasPin ? 'Modifier' : 'Définir'}
          </button>
        )}
      </div>

      {open && (
        <form id={formId} onSubmit={submit} noValidate className="mt-4 space-y-4 border-t border-night-100 pt-4">
          {needsProof && (useAccountPassword ? (
            <PasswordField label="Mot de passe du compte" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.current} autoFocus />
          ) : (
            <PasswordField label="Code actuel" {...digitProps} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))} error={errors.current} autoFocus />
          ))}
          {needsProof && status.hasPassword && (
            <button type="button" onClick={() => { setUseAccountPassword((v) => !v); setErrors({}) }} className="min-h-[44px] rounded-lg text-left text-[13px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
              {useAccountPassword ? 'Utiliser mon code actuel' : 'Code oublié ? Mot de passe du compte'}
            </button>
          )}
          <PasswordField label="Nouveau code" {...digitProps} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={errors.pin} autoFocus={!needsProof} />
          <PasswordField label="Confirmer le nouveau code" {...digitProps} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} error={errors.confirm} />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="submit" disabled={busy === 'pin'} aria-busy={busy === 'pin'} className={btn.primary}>
              {busy === 'pin' ? 'Enregistrement…' : 'Enregistrer le code'}
            </button>
            <button type="button" onClick={() => { reset(); setOpen(false) }} className={btn.secondary}>Annuler</button>
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
  const [name, setName] = useState('Cet appareil')
  const [adding, setAdding] = useState(false)
  const [platform, setPlatform] = useState<boolean | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    setName(guessDeviceName())
    void platformAuthenticatorAvailable().then(setPlatform)
  }, [])

  const canSimulate = status.demo
  const canUseReal = platform === true
  const available = canUseReal || canSimulate

  const register = async () => {
    const label = name.trim() || 'Cet appareil'
    const ok = await run('passkey-add', async () => {
      if (!canUseReal || !webauthnSupported()) return vaultApi.simulateRegister(label)
      try {
        return await vaultApi.registerPasskey(label)
      } catch (e) {
        if (canSimulate && isWebauthnServerUnavailable(e)) return vaultApi.simulateRegister(label)
        if (isWebauthnServerUnavailable(e)) throw new VaultApiError(503, 'webauthn_unavailable', 'L’empreinte n’est pas encore disponible sur ce serveur. Utilisez votre code.')
        throw e
      }
    }, 'Empreinte enregistrée sur cet appareil.')
    if (ok) setAdding(false)
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-night-900"><Fingerprint className="h-6 w-6" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-night-900">Empreinte ou visage</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-night-600">Touch ID, Face ID, Windows Hello ou empreinte Android</p>
        </div>
      </div>

      {status.passkeys.length > 0 && (
        <ul className="mt-3 divide-y divide-night-100 border-t border-night-100" aria-label="Appareils enregistrés">
          {status.passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <Smartphone className="h-5 w-5 shrink-0 text-night-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-night-900">{p.name}{p.simulated ? ' (simulé)' : ''}</p>
                <p className="text-[12px] text-night-600">
                  Ajouté le {fmt(p.createdAt)}{p.lastUsedAt ? `, utilisé le ${fmt(p.lastUsedAt)}` : ''}{p.synced ? ' · synchronisé' : ''}
                </p>
              </div>
              {confirmId === p.id ? (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run('passkey-del', () => vaultApi.deletePasskey(p.id), 'Appareil retiré.').then(() => setConfirmId(null))}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-alert-500 px-3 text-[12.5px] font-bold text-white hover:bg-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-300"
                  >
                    Retirer
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[12.5px] font-semibold text-night-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
                    Annuler
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  aria-label={`Retirer ${p.name}`}
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
          <p className="text-[12.5px] leading-relaxed text-night-600">Cet appareil ou ce navigateur ne propose pas d’empreinte ni de reconnaissance faciale.</p>
        )}
        {available && !adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={busy !== null} className={btn.secondary}>
            <Fingerprint className="h-5 w-5 text-leaf-600" aria-hidden="true" /> Ajouter cet appareil
          </button>
        )}
        {available && adding && (
          <div className="space-y-3">
            <LabeledInput label="Nom de l’appareil" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
            {!canUseReal && canSimulate && (
              <p className="text-[12px] text-night-600">Démonstration : l’empreinte sera simulée sur cet appareil.</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" onClick={register} disabled={busy === 'passkey-add'} aria-busy={busy === 'passkey-add'} className={btn.primary}>
                {busy === 'passkey-add' ? 'En attente de l’empreinte…' : 'Enregistrer mon empreinte'}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={btn.secondary}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
