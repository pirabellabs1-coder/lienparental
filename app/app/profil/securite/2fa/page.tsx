'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, Copy, KeyRound, ShieldCheck, Smartphone, ShieldHalf } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, Pill, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { kickNotifications } from '@/lib/notify/client'
import { authErrorMessage } from '@/lib/auth/errors'

// Supabase : supabase.auth.mfa (TOTP) — enroll → QR + clé, challengeAndVerify, unenroll.
// Démonstration : clé fictive, aucun appel réseau.
const MOCK_SECRET = 'JBSWY3DPEHPK3PXP'
const FRIENDLY_NAME = 'Application d’authentification'

type Phase = 'loading' | 'intro' | 'setup' | 'enabled'

export default function TwoFactorPage() {
  const t = useTranslations('account.security.twoFactor')
  const [phase, setPhase] = useState<Phase>(SUPABASE_ENABLED ? 'loading' : 'intro')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [secret, setSecret] = useState(SUPABASE_ENABLED ? '' : MOCK_SECRET)
  const [qr, setQr] = useState<string | null>(null)
  const setupRef = useRef<HTMLHeadingElement>(null)
  // Redirection depuis /admin (M7, audit v3) : un administrateur doit activer la 2FA.
  const [adminRequired, setAdminRequired] = useState(false)
  useEffect(() => { setAdminRequired(new URLSearchParams(window.location.search).get('raison') === 'admin') }, [])

  useEffect(() => { if (phase === 'setup') setupRef.current?.focus() }, [phase])

  // État initial : un facteur TOTP vérifié existe-t-il déjà ?
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    createClient().auth.mfa.listFactors().then(({ data, error: err }) => {
      if (err) { setError(authErrorMessage(err)); setPhase('intro'); return }
      const verified = data?.totp.find(f => f.status === 'verified')
      if (verified) { setFactorId(verified.id); setPhase('enabled') } else setPhase('intro')
    })
  }, [])

  const copySecret = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* presse-papiers indisponible */ }
  }

  const startSetup = async () => {
    setError(null)
    if (!SUPABASE_ENABLED) { setPhase('setup'); return }
    setBusy(true)
    const mfa = createClient().auth.mfa
    // Un enrôlement abandonné laisse un facteur « unverified » qui bloquerait le nouveau.
    const { data: list } = await mfa.listFactors()
    for (const f of list?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await mfa.unenroll({ factorId: f.id }).catch(() => undefined)
    }
    const { data, error: err } = await mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME, issuer: 'Lien Parental' })
    setBusy(false)
    if (err || !data) { setError(authErrorMessage(err)); return }
    setFactorId(data.id)
    setSecret(data.totp.secret)
    setQr(data.totp.qr_code)
    setCode('')
    setPhase('setup')
  }

  const cancelSetup = async () => {
    setError(null)
    if (SUPABASE_ENABLED && factorId) await createClient().auth.mfa.unenroll({ factorId }).catch(() => undefined)
    setFactorId(null)
    setSecret(SUPABASE_ENABLED ? '' : MOCK_SECRET)
    setQr(null)
    setCode('')
    setPhase('intro')
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6 || verifying) return
    setError(null)
    setVerifying(true)
    if (SUPABASE_ENABLED) {
      if (!factorId) { setVerifying(false); return }
      // La session passe en aal2 ; users.mfa_enabled est synchronisé par trigger (0200).
      const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code })
      setVerifying(false)
      if (err) { setCode(''); setError(authErrorMessage(err, 'mfa')); return }
      setSecret('')
      setQr(null)
      setPhase('enabled')
      kickNotifications() // alerte de sécurité « double authentification activée »
      return
    }
    await new Promise(r => setTimeout(r, 500))
    setVerifying(false)
    setPhase('enabled')
  }

  const disable = async () => {
    setError(null)
    if (!SUPABASE_ENABLED) { setPhase('intro'); setCode(''); return }
    if (!factorId) return
    setBusy(true)
    const supabase = createClient()
    // unenroll exige une session aal2 (garantie par le middleware pour /app/*).
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
    if (err) { setBusy(false); setError(authErrorMessage(err)); return }
    // Rafraîchit le jeton pour refléter le nouveau niveau d'assurance.
    await supabase.auth.refreshSession().catch(() => undefined)
    setBusy(false)
    setFactorId(null)
    setCode('')
    setPhase('intro')
    kickNotifications()
  }

  const enabled = phase === 'enabled'

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/profil/securite" showBell={false} />
      <div className="px-5 pb-8 pt-3">
        <Banner icon={<ShieldHalf className="h-7 w-7" strokeWidth={1.8} />} title={t('bannerTitle')}>
          {t('bannerText')}
        </Banner>

        {adminRequired && (
          <Banner role="status" className="mt-3" icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.8} />} title={t('adminTitle')}>
            {phase === 'enabled'
              ? <>{t('adminActive')} <Link href="/admin" className="font-bold text-night-900 underline underline-offset-2">{t('adminLink')}</Link></>
              : t('adminRequired')}
          </Banner>
        )}

        <PhoneIllustration />

        <div className="flex items-center gap-4" aria-live="polite">
          <span className="text-[14px] font-bold text-night-900">{t('status')}</span>
          {phase === 'loading'
            ? <span className="text-[12.5px] text-night-600">{t('loading')}</span>
            : enabled ? <Pill tone="leafSoft">{t('on')}</Pill> : <Pill tone="orange">{t('off')}</Pill>}
        </div>

        {error && <p role="alert" className="mt-4 text-sm font-medium text-alert-500">{error}</p>}

        {phase !== 'setup' && phase !== 'loading' && (
          <ul className="mt-4 divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white shadow-soft">
            <Feature icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.7} />} title={t('features.protectionTitle')} text={t('features.protectionText')} />
            <Feature icon={<KeyRound className="h-6 w-6" strokeWidth={1.7} />} title={t('features.codeTitle')} text={t('features.codeText')} />
            <Feature icon={<Smartphone className="h-6 w-6" strokeWidth={1.7} />} title={t('features.easyTitle')} text={t('features.easyText')} />
          </ul>
        )}

        {phase === 'intro' && (
          <button type="button" onClick={() => void startSetup()} disabled={busy} aria-busy={busy} className={cn(btn.primary, 'mt-6')}>
            {busy ? t('preparing') : t('enable')}
          </button>
        )}

        {phase === 'enabled' && (
          <button type="button" onClick={() => void disable()} disabled={busy} aria-busy={busy} className={cn(btn.dangerOutline, 'mt-6')}>
            {busy ? t('disabling') : t('disable')}
          </button>
        )}

        {phase === 'setup' && (
          <form onSubmit={verify} className="mt-5 space-y-4 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
            <h2 ref={setupRef} tabIndex={-1} className="text-[15px] font-bold text-night-900 focus:outline-none">{t('setupTitle')}</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-night-800">
              <li>{t('setupStep1')}</li>
              <li>{qr ? t('setupStep2Qr') : t('setupStep2Key')}</li>
              <li>{t('setupStep3')}</li>
            </ol>
            {qr && (
              // QR fourni par Supabase (data URL SVG).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('qrAlt')} width={176} height={176} className="mx-auto h-44 w-44 rounded-xl bg-white p-2 ring-1 ring-night-100" />
            )}
            <div className="flex items-center gap-2 rounded-xl2 bg-night-50 p-3">
              <code className="flex-1 break-all font-mono text-sm text-night-900">{secret}</code>
              <button type="button" onClick={copySecret} aria-label={t('copyKey')} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-700 hover:bg-white">
                {copied ? <Check className="h-5 w-5 text-leaf-500" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            <div>
              <label htmlFor="otp" className="mb-2 block text-[13px] font-bold text-night-900">{t('codeLabel')}</label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="• • • • • •"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className="min-h-[52px] w-full rounded-xl2 border border-leaf-200 bg-white px-4 text-center text-[22px] font-bold tracking-[0.5em] text-night-900 focus-visible:border-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-100"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => void cancelSetup()} className={btn.secondary}>{t('cancel')}</button>
              <button type="submit" disabled={code.length !== 6 || verifying} className={cn(btn.primary, '')}>
                {verifying ? t('verifying') : t('verify')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3.5 px-4 py-4">
      <span aria-hidden className="mt-0.5 shrink-0 text-night-900">{icon}</span>
      <span>
        <span className="block text-[13.5px] font-bold text-night-900">{title}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-night-700">{text}</span>
      </span>
    </li>
  )
}

function PhoneIllustration() {
  return (
    <div aria-hidden className="my-8 flex items-center justify-center gap-3">
      <svg viewBox="0 0 64 112" className="h-28 w-16">
        <rect x="3" y="3" width="58" height="106" rx="12" fill="#fff" stroke="#0b2d5b" strokeWidth="4" />
        <rect x="24" y="8" width="16" height="4" rx="2" fill="#0b2d5b" />
        <path d="M32 40 46 46v10c0 9-6 15-14 18-8-3-14-9-14-18V46l14-6Z" fill="#2e7d32" />
        <path d="m26 57 4.5 4.5L39 53" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="h-px w-8 border-t-2 border-dashed border-night-200" />
      <span className="inline-flex h-12 items-center gap-2 rounded-xl2 border-2 border-leaf-300 bg-white px-4 text-[20px] font-bold tracking-[0.2em] text-night-900">
        • • • 678
      </span>
    </div>
  )
}
