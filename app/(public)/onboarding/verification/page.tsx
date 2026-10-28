'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { EmailCodeInput } from '@/components/onboarding/EmailCodeInput'
import { btn } from '@/components/onboarding/styles'
import { useOnboardingDraft } from '@/components/onboarding/draft'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { kickNotifications, reportSignIn } from '@/lib/notify/client'
import { takePendingPassword } from '@/lib/auth/pending-password'
import { authErrorMessage, isRateLimited } from '@/lib/auth/errors'
import { EMAIL_OTP_MIN, isDemoEmailOtp, parseEmailOtpLength } from '@/lib/auth/email-otp'
import { emailOtpSchema } from '@/lib/auth/validation'

// Étape 7 — Vérification de l'e-mail par le code reçu (6 à 10 chiffres : réglage Supabase « Email OTP Length »,
// lib/auth/email-otp.ts). Champ unique : un code de 7 chiffres ne tenait pas dans 6 cases.
// Supabase : verifyOtp({ type: 'signup' }) ; durée de validité du code = « Email OTP Expiration »
// du projet (1 h, valeur par défaut, annoncée dans l'e-mail) ; GoTrue limite aussi les vérifications par IP.
// Les 5 essais ci-dessous sont une limite d'interface complémentaire.
const RESEND_DELAY = 45
const MAX_ATTEMPTS = 5
/** Longueur connue du code (réglage du projet) : validation automatique au collage / autofill ; sinon au clic. */
const EXPECTED_LENGTH = parseEmailOtpLength(process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH)

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function VerificationPage() {
  const router = useRouter()
  const t = useTranslations('public.onboarding.verify')
  const { draft, ready } = useOnboardingDraft()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [countdown, setCountdown] = useState(RESEND_DELAY)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => Math.max(c - 1, 0)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const missingEmail = SUPABASE_ENABLED && ready && !draft.email

  const resend = async () => {
    if (countdown > 0 || blocked) return
    setCode('')
    setError(null)
    setInfo(null)
    if (SUPABASE_ENABLED) {
      if (!draft.email) return
      // Nouveau code par NOTRE e-mail (POST /api/auth/signup, generateLink) ; réponse neutre.
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ email: draft.email, resend: true }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(data?.error?.message ?? t('errUnavailable'))
          setCountdown(RESEND_DELAY)
          return
        }
      } catch {
        setError(t('errNetwork'))
        setCountdown(RESEND_DELAY)
        return
      }
    }
    setInfo(t('resent'))
    setAttempts(0)
    setCountdown(RESEND_DELAY)
  }

  const registerFailure = () => {
    const next = attempts + 1
    setAttempts(next)
    if (next >= MAX_ATTEMPTS) {
      setBlocked(true)
      setError(t('errBlocked'))
    } else {
      setError(t('errWrong', { count: MAX_ATTEMPTS - next }))
    }
    setCode('')
  }

  const verify = async (value: string) => {
    if (blocked || verifying || !emailOtpSchema.safeParse(value).success) return
    setInfo(null)

    if (SUPABASE_ENABLED) {
      if (!draft.email) return
      setVerifying(true)
      const supabase = createClient()
      const { error: err } = await supabase.auth.verifyOtp({ email: draft.email, token: value, type: 'signup' })
      if (!err) {
        // Adresse prouvée, session ouverte. Le compte a un mot de passe aléatoire (créé par le serveur) :
        // on pose maintenant celui choisi à l'inscription, puis on ferme toute autre session.
        await reportSignIn()
        kickNotifications()
        const chosen = takePendingPassword(draft.email)
        if (!chosen) { router.push('/nouveau-mot-de-passe?inscription=1'); return }
        const { error: pwErr } = await supabase.auth.updateUser({ password: chosen })
        if (pwErr) { router.push('/nouveau-mot-de-passe?inscription=1'); return }
        await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
        router.push('/onboarding/profil')
        return
      }
      setVerifying(false)
      if (isRateLimited(err)) {
        setBlocked(true)
        setError(authErrorMessage(err, 'otp'))
        setCode('')
        return
      }
      if (err.code === 'otp_expired') {
        const next = attempts + 1
        setAttempts(next)
        if (next >= MAX_ATTEMPTS) {
          setBlocked(true)
          setError(t('errBlocked'))
        } else {
          setError(t('errWrongOrExpired', { count: MAX_ATTEMPTS - next }))
        }
        setCode('')
        return
      }
      setError(authErrorMessage(err, 'otp'))
      setCode('')
      return
    }

    // Démonstration : 123456 (ou 1234567, 12345678… jusqu'à 10 chiffres) = succès.
    if (isDemoEmailOtp(value)) {
      setVerifying(true)
      router.push('/onboarding/profil')
      return
    }
    registerFailure()
  }

  return (
    <OnboardingScreen
      step={7}
      title={t('title')}
      onSubmit={(e) => { e.preventDefault(); void verify(code) }}
      subtitle={
        <>
          {t('sentTo')}
          <br />
          <strong className="font-bold text-night-900">{draft.email || t('yourEmail')}</strong>
        </>
      }
      footer={
        <>
          <button
            type="submit"
            className={cn(btn.primary, 'w-full')}
            disabled={code.length < EMAIL_OTP_MIN || blocked || verifying || missingEmail}
            aria-busy={verifying}
          >
            {verifying ? t('verifying') : t('verify')}
          </button>
          <p className="text-center text-[13px] text-night-600">
            {t('notReceived')}
            <br />
            <span className="font-semibold text-leaf-600">{t('checkSpam')}</span>
          </p>
        </>
      }
    >
      <EmailCodeInput
        label={t('codeLabel')}
        value={code}
        onChange={(v) => {
          setCode(v)
          if (error && !blocked) setError(null)
        }}
        onComplete={(v) => void verify(v)}
        expectedLength={EXPECTED_LENGTH}
        disabled={blocked || missingEmail}
        error={!!error}
        autoFocus
        describedBy="otp-help"
      />
      <p id="otp-help" className="mt-1.5 text-[13px] text-night-600">
        {t('help')}
      </p>

      <div className="mt-4 min-h-[20px]" aria-live="polite">
        {missingEmail && (
          <p role="alert" className="text-sm font-semibold text-alert-600">
            {t('noSession')}{' '}
            <Link href="/onboarding/inscription" className="underline underline-offset-2">{t('restart')}</Link>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-alert-600">
            {error}
          </p>
        )}
        {info && !error && <p className="text-sm font-semibold text-leaf-700">{info}</p>}
      </div>

      <button
        type="button"
        onClick={() => void resend()}
        disabled={countdown > 0 || blocked || missingEmail}
        className="mt-1 inline-flex min-h-[44px] items-center text-[13px] font-bold text-leaf-600 underline-offset-4 enabled:hover:underline disabled:cursor-default disabled:font-semibold disabled:text-leaf-700/80"
      >
        {blocked ? t('resendBlocked') : countdown > 0 ? t('resendIn', { time: mmss(countdown) }) : t('resend')}
      </button>
    </OnboardingScreen>
  )
}
