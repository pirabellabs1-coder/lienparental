'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { OTPInput } from '@/components/onboarding/OTPInput'
import { btn } from '@/components/onboarding/styles'
import { useOnboardingDraft } from '@/components/onboarding/draft'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage, isRateLimited } from '@/lib/auth/errors'

// Étape 7 — Vérification de l'e-mail par code à 6 chiffres.
// Supabase : verifyOtp({ type: 'signup' }) ; durée de validité du code = « Email OTP Expiration »
// du projet (15 min recommandées) ; GoTrue limite aussi les vérifications par IP.
// Les 5 essais ci-dessous sont une limite d'interface complémentaire.
const RESEND_DELAY = 45
const MAX_ATTEMPTS = 5

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function VerificationPage() {
  const router = useRouter()
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
    const t = setTimeout(() => setCountdown((c) => Math.max(c - 1, 0)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const missingEmail = SUPABASE_ENABLED && ready && !draft.email

  const resend = async () => {
    if (countdown > 0 || blocked) return
    setCode('')
    setError(null)
    setInfo(null)
    if (SUPABASE_ENABLED) {
      if (!draft.email) return
      const { error: err } = await createClient().auth.resend({ type: 'signup', email: draft.email })
      if (err) {
        setError(authErrorMessage(err, 'resend'))
        setCountdown(RESEND_DELAY)
        return
      }
    }
    setInfo('Un nouveau code vient de vous être envoyé.')
    setAttempts(0)
    setCountdown(RESEND_DELAY)
  }

  const registerFailure = () => {
    const next = attempts + 1
    setAttempts(next)
    if (next >= MAX_ATTEMPTS) {
      setBlocked(true)
      setError('Trop de tentatives. La vérification est temporairement bloquée, réessayez plus tard.')
    } else {
      setError(`Code incorrect. Il vous reste ${MAX_ATTEMPTS - next} tentative${MAX_ATTEMPTS - next > 1 ? 's' : ''}.`)
    }
    setCode('')
  }

  const verify = async (value: string) => {
    if (blocked || verifying || value.length !== 6) return
    setInfo(null)

    if (SUPABASE_ENABLED) {
      if (!draft.email) return
      setVerifying(true)
      const { error: err } = await createClient().auth.verifyOtp({ email: draft.email, token: value, type: 'signup' })
      if (!err) {
        // Session ouverte (cookies) : le profil public.users a été créé par le trigger 0200.
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
          setError('Trop de tentatives. La vérification est temporairement bloquée, réessayez plus tard.')
        } else {
          setError(`Code incorrect ou expiré. Il vous reste ${MAX_ATTEMPTS - next} tentative${MAX_ATTEMPTS - next > 1 ? 's' : ''}. Vous pouvez aussi demander un nouveau code.`)
        }
        setCode('')
        return
      }
      setError(authErrorMessage(err, 'otp'))
      setCode('')
      return
    }

    // Démonstration : "123456" = succès.
    if (value === '123456') {
      setVerifying(true)
      router.push('/onboarding/profil')
      return
    }
    registerFailure()
  }

  return (
    <OnboardingScreen
      step={7}
      title="Vérifiez votre e-mail"
      subtitle={
        <>
          Nous venons de vous envoyer un code à 6 chiffres à l’adresse suivante :
          <br />
          <strong className="font-bold text-night-900">{draft.email || 'votre adresse e-mail'}</strong>
        </>
      }
      footer={
        <>
          <button
            type="button"
            className={cn(btn.primary, 'w-full')}
            disabled={code.length !== 6 || blocked || verifying || missingEmail}
            onClick={() => void verify(code)}
          >
            {verifying ? 'Vérification…' : 'Vérifier'}
          </button>
          <p className="text-center text-[13px] text-night-600">
            Vous n’avez pas reçu le code ?
            <br />
            <span className="font-semibold text-leaf-600">Vérifiez le dossier spam</span>
          </p>
        </>
      }
    >
      <OTPInput
        value={code}
        onChange={(v) => {
          setCode(v)
          if (error && !blocked) setError(null)
        }}
        onComplete={(v) => void verify(v)}
        disabled={blocked || missingEmail}
        error={!!error}
        autoFocus
        describedBy="otp-help"
      />
      <p id="otp-help" className="sr-only">
        Saisissez le code reçu par e-mail. Il est valable 15 minutes.
      </p>

      <div className="mt-4 min-h-[20px]" aria-live="polite">
        {missingEmail && (
          <p role="alert" className="text-sm font-semibold text-alert-600">
            Session d’inscription introuvable.{' '}
            <Link href="/onboarding/inscription" className="underline underline-offset-2">Recommencer l’inscription</Link>
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
        {blocked ? 'Renvoi indisponible' : countdown > 0 ? `Renvoyer le code (${mmss(countdown)})` : 'Renvoyer le code'}
      </button>
    </OnboardingScreen>
  )
}
