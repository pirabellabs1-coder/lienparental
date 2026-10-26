'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { OTPInput } from '@/components/onboarding/OTPInput'
import { PasswordField, PASSWORD_RULES } from '@/components/onboarding/PasswordField'
import { btn, linkLeaf } from '@/components/onboarding/styles'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'
import { passwordSchema } from '@/lib/auth/validation'

type Phase = 'checking' | 'invalid' | 'mfa' | 'form' | 'done'

// Nouveau mot de passe — atteint via le lien e-mail (/auth/confirm, type=recovery)
// qui ouvre une session de récupération. Même grammaire visuelle que l'onboarding.
export default function NouveauMotDePassePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(SUPABASE_ENABLED ? 'checking' : 'form')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setPhase('invalid'); return }
      // Compte protégé par 2FA : le code TOTP est exigé avant de changer le mot de passe.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totp = factors?.totp.find(f => f.status === 'verified')
        if (totp) { setFactorId(totp.id); setPhase('mfa'); return }
      }
      setPhase('form')
    })()
  }, [])

  const rulesOk = PASSWORD_RULES.every(r => r.test(password))
  const pwdError = submitted && !rulesOk ? 'Le mot de passe ne respecte pas encore toutes les règles.' : undefined
  const confirmError = submitted && confirm !== password ? 'Les mots de passe ne correspondent pas.' : undefined

  const verifyMfa = async (value: string) => {
    if (!factorId || value.length !== 6 || loading) return
    setLoading(true)
    setError(null)
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: value })
    setLoading(false)
    if (err) { setCode(''); setError(authErrorMessage(err, 'mfa')); return }
    setPhase('form')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (phase === 'mfa') { void verifyMfa(code); return }
    setSubmitted(true)
    setError(null)
    if (!rulesOk || confirm !== password || loading) return
    if (!SUPABASE_ENABLED) { setPhase('done'); return }

    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Mot de passe invalide.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password: parsed.data })
    if (err) {
      setLoading(false)
      setError(authErrorMessage(err, 'update-password'))
      return
    }
    // Toute autre session (éventuellement compromise) doit se reconnecter.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
    setPassword('')
    setConfirm('')
    setLoading(false)
    setPhase('done')
  }

  if (phase === 'checking') {
    return <main className="flex flex-1 flex-col" aria-busy="true"><OnboardingScreen back={false} title="Vérification du lien…" /></main>
  }

  if (phase === 'invalid') {
    return (
      <main className="flex flex-1 flex-col">
        <OnboardingScreen
          back="/onboarding/connexion"
          title="Lien expiré"
          subtitle="Ce lien de réinitialisation n’est plus valide ou a déjà été utilisé. Demandez-en un nouveau."
          footer={
            <Link href="/mot-de-passe-oublie" className={cn(btn.primary, 'w-full')}>
              Demander un nouveau lien
            </Link>
          }
        />
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main className="flex flex-1 flex-col">
        <OnboardingScreen
          back={false}
          align="center"
          media={
            <span className="mx-auto mb-5 mt-10 grid h-20 w-20 place-items-center rounded-full bg-leaf-50 text-leaf-600" aria-hidden="true">
              <ShieldCheck className="h-9 w-9" />
            </span>
          }
          title="Mot de passe modifié"
          subtitle={<span role="status">Votre nouveau mot de passe est enregistré.{SUPABASE_ENABLED && ' Les autres appareils ont été déconnectés.'}</span>}
          footer={
            <button
              type="button"
              className={cn(btn.primary, 'w-full')}
              onClick={() => router.push(SUPABASE_ENABLED ? '/app' : '/onboarding/connexion')}
            >
              {SUPABASE_ENABLED ? 'Accéder à mon espace' : 'Retour à la connexion'}
            </button>
          }
        />
      </main>
    )
  }

  if (phase === 'mfa') {
    return (
      <main className="flex flex-1 flex-col">
        <OnboardingScreen
          back={false}
          title="Double authentification"
          subtitle="Saisissez le code à 6 chiffres de votre application d’authentification pour continuer."
          onSubmit={onSubmit}
          footer={
            <button type="submit" className={cn(btn.primary, 'w-full')} disabled={loading || code.length !== 6} aria-busy={loading}>
              {loading ? 'Vérification…' : 'Vérifier'}
            </button>
          }
        >
          <OTPInput
            value={code}
            onChange={(v) => { setCode(v); if (error) setError(null) }}
            onComplete={(v) => void verifyMfa(v)}
            disabled={loading}
            error={!!error}
            autoFocus
            ariaLabel="Code de double authentification"
          />
          <div className="mt-4 min-h-[20px]" aria-live="polite">
            {error && <p role="alert" className="text-sm font-semibold text-alert-600">{error}</p>}
          </div>
        </OnboardingScreen>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col">
      <OnboardingScreen
        back="/onboarding/connexion"
        title="Nouveau mot de passe"
        subtitle="Choisissez un mot de passe que vous n’utilisez nulle part ailleurs."
        onSubmit={onSubmit}
        footer={
          <>
            {error && <p role="alert" className="text-center text-sm font-semibold text-alert-600">{error}</p>}
            <button type="submit" className={cn(btn.primary, 'w-full')} disabled={loading} aria-busy={loading}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <Link href="/onboarding/connexion" className={cn(linkLeaf, 'inline-flex min-h-[44px] w-full items-center justify-center text-[13px]')}>
              Annuler
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <PasswordField
            label="Nouveau mot de passe"
            value={password}
            onValueChange={setPassword}
            showRules
            showStrength
            autoComplete="new-password"
            placeholder="Votre nouveau mot de passe"
            errorText={pwdError}
          />
          <PasswordField
            label="Confirmer le mot de passe"
            value={confirm}
            onValueChange={setConfirm}
            autoComplete="new-password"
            placeholder="Saisissez-le à nouveau"
            errorText={confirmError}
          />
        </div>
      </OnboardingScreen>
    </main>
  )
}
