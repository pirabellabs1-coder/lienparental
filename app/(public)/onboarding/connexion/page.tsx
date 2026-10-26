'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { TextField } from '@/components/onboarding/fields'
import { PasswordField } from '@/components/onboarding/PasswordField'
import { OTPInput } from '@/components/onboarding/OTPInput'
import { GoogleButton, OrSeparator } from '@/components/auth/GoogleButton'
import { linkLeaf } from '@/components/onboarding/styles'
import { writeDraft } from '@/components/onboarding/draft'
import { DEMO_ACCOUNTS, DEMO_MODE, findDemoAccount, startDemoSession, type DemoAccount } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'
import { safeNext } from '@/lib/auth/redirect'
import { emailSchema } from '@/lib/auth/validation'

const primaryBtn = 'inline-flex h-12 w-full items-center justify-center rounded-xl bg-leaf-500 font-semibold text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] transition-[transform,background-color] hover:bg-leaf-600 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'

const LINK_ERRORS: Record<string, string> = {
  lien: 'Ce lien n’est plus valide ou a déjà été utilisé. Connectez-vous ou demandez un nouveau lien.',
  google: 'La connexion avec Google n’a pas abouti. Réessayez ou connectez-vous avec votre e-mail.',
  compte: 'Ce compte est en cours de suppression. Contactez le support pour le récupérer.',
}

/** Cible après connexion : uniquement /app/* ou /admin/* (pas de redirection ouverte). */
function targetFor(suite: string | null, isAdmin: boolean) {
  if (suite?.startsWith('/admin')) return isAdmin ? safeNext(suite, '/admin') : '/app'
  if (suite?.startsWith('/app')) return safeNext(suite, '/app')
  return isAdmin ? '/admin' : '/app'
}

/** Suite après « Continuer avec Google » : /app/* ou /admin/* uniquement (rôle revérifié par le middleware). */
const googleNext = (suite: string | null) => (suite?.startsWith('/app') || suite?.startsWith('/admin') ? safeNext(suite, '/app') : '/app')

function Connexion() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => LINK_ERRORS[params.get('erreur') ?? ''] ?? null)
  const [loading, setLoading] = useState(false)
  // Étape 2FA (Supabase) : code TOTP à 6 chiffres.
  const [phase, setPhase] = useState<'credentials' | 'mfa'>('credentials')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  // --- Démo ------------------------------------------------------------------
  const enter = (account: DemoAccount) => {
    setLoading(true)
    startDemoSession(account.id)
    const suite = params.get('suite')
    const target = account.id === 'admin' ? safeNext(suite?.startsWith('/admin') ? suite : null, '/admin') : safeNext(suite?.startsWith('/app') ? suite : null, account.home)
    router.push(target)
    router.refresh()
  }

  // --- Supabase ----------------------------------------------------------------
  const finish = async () => {
    const supabase = createClient()
    const { data: isAdmin } = await supabase.rpc('is_admin')
    router.replace(targetFor(params.get('suite'), isAdmin === true))
    router.refresh()
  }

  /** Si un facteur TOTP vérifié existe et que la session n'est qu'en aal1, on passe à l'étape code. */
  const needsMfa = async () => {
    const supabase = createClient()
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal || aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') return false
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp.find(f => f.status === 'verified')
    if (!totp) return false
    setFactorId(totp.id)
    setPhase('mfa')
    setCode('')
    return true
  }

  // Redirigé par le middleware (?mfa=1) avec une session aal1 : on reprend à l'étape code.
  useEffect(() => {
    if (!SUPABASE_ENABLED || params.get('mfa') !== '1') return
    void needsMfa()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInSupabase = async () => {
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success || !password) {
      setError('Veuillez saisir une adresse e-mail valide et votre mot de passe.')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email: parsed.data, password })
    if (err) {
      setLoading(false)
      if (err.code === 'email_not_confirmed') {
        // Compte créé mais jamais vérifié : on renvoie un code et on reprend l'étape 7.
        writeDraft({ email: parsed.data })
        await supabase.auth.resend({ type: 'signup', email: parsed.data }).catch(() => undefined)
        router.push('/onboarding/verification')
        return
      }
      setError(authErrorMessage(err, 'signin'))
      return
    }
    setPassword('')
    if (await needsMfa()) { setLoading(false); return }
    await finish()
  }

  const verifyMfa = async (value: string) => {
    if (!factorId || value.length !== 6 || loading) return
    setLoading(true)
    setError(null)
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: value })
    if (err) {
      setLoading(false)
      setCode('')
      setError(authErrorMessage(err, 'mfa'))
      return
    }
    await finish()
  }

  const cancelMfa = async () => {
    await createClient().auth.signOut({ scope: 'local' }).catch(() => undefined)
    setPhase('credentials')
    setFactorId(null)
    setCode('')
    setError(null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (SUPABASE_ENABLED) {
      if (phase === 'mfa') void verifyMfa(code)
      else void signInSupabase()
      return
    }
    if (!emailSchema.safeParse(email).success || !password) {
      setError('Veuillez saisir une adresse e-mail valide et votre mot de passe.')
      return
    }
    const account = DEMO_MODE ? findDemoAccount(email, password) : null
    if (!account) {
      setError('E-mail ou mot de passe incorrect.')
      return
    }
    setError(null)
    enter(account)
  }

  if (phase === 'mfa') {
    return (
      <OnboardingScreen
        step={5}
        back={false}
        title="Double authentification"
        subtitle="Saisissez le code à 6 chiffres affiché par votre application d’authentification."
        onSubmit={onSubmit}
        footer={
          <>
            <button type="submit" className={primaryBtn} disabled={loading || code.length !== 6} aria-busy={loading}>
              {loading ? 'Vérification…' : 'Vérifier'}
            </button>
            <button type="button" onClick={cancelMfa} className={cn(linkLeaf, 'inline-flex min-h-[44px] w-full items-center justify-center text-[13px]')}>
              Utiliser un autre compte
            </button>
          </>
        }
      >
        <OTPInput
          value={code}
          onChange={(v) => { setCode(v); if (error) setError(null) }}
          onComplete={verifyMfa}
          disabled={loading}
          error={!!error}
          autoFocus
          ariaLabel="Code de double authentification"
          describedBy="mfa-help"
        />
        <p id="mfa-help" className="sr-only">Le code change toutes les 30 secondes dans votre application.</p>
        <div className="mt-4 min-h-[20px]" aria-live="polite">
          {error && <p role="alert" className="text-sm font-semibold text-alert-600">{error}</p>}
        </div>
      </OnboardingScreen>
    )
  }

  return (
    <OnboardingScreen
      step={5}
      back="/onboarding"
      title="Se connecter"
      subtitle={
        <>
          Bienvenue de retour !<br />
          Connectez-vous pour accéder à votre compte.
        </>
      }
      onSubmit={onSubmit}
      footer={
        <>
          <button type="submit" className={primaryBtn} disabled={loading} aria-busy={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="pt-2 text-center text-[13px] text-night-600">
            Vous n’avez pas encore de compte ?
            <br />
            <Link href="/onboarding/inscription" className={cn(linkLeaf, 'inline-flex min-h-[40px] items-center')}>
              Créer un compte
            </Link>
          </p>
        </>
      }
    >
      <div className="space-y-5">
        <GoogleButton next={googleNext(params.get('suite'))} />
        <OrSeparator />
        <TextField
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="exemple@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onValueChange={setPassword}
          autoComplete="current-password"
          placeholder="Votre mot de passe"
        />
        <Link href="/mot-de-passe-oublie" className={cn(linkLeaf, '-mt-1 inline-flex min-h-[44px] items-center text-[13px] underline')}>
          Mot de passe oublié ?
        </Link>
        {error && (
          <p role="alert" className="text-sm font-semibold text-alert-600">
            {error}
          </p>
        )}

        {DEMO_MODE && (
          <section aria-labelledby="demo-title" className="rounded-2xl border border-dashed border-leaf-300 bg-leaf-50/60 p-4">
            <h2 id="demo-title" className="flex items-center gap-2 text-[13.5px] font-bold text-night-900">
              <KeyRound className="h-4 w-4 text-leaf-600" aria-hidden /> Comptes de démonstration
            </h2>
            <p className="mt-1 text-[12px] text-night-600">Session temporaire de 8 heures. Mot de passe : Demo2026!</p>
            <ul className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map(a => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => { setEmail(a.email); setPassword(a.password); enter(a) }}
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2 text-left ring-1 ring-night-100 transition-colors hover:ring-leaf-300"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-night-900">{a.label}</span>
                      <span className="block truncate text-[12px] text-night-600">{a.email}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold text-leaf-600">Se connecter</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </OnboardingScreen>
  )
}

// Étape 5 — Se connecter
export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <Connexion />
    </Suspense>
  )
}
