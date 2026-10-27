'use client'

/**
 * Connexion DÉDIÉE à l'administration — isolée du parcours des parents.
 *
 * On n'arrive ici que par le lien secret /console/<secret>, qui pose le cookie de
 * porte (middleware + lib/admin/gate). Sans ce cookie, /console répond 404.
 * Après connexion, on vérifie le rôle admin en base (RPC is_admin) puis on ouvre /admin.
 * La 2FA n'est pas obligatoire ; si l'admin en a tout de même activé une, l'étape
 * code s'affiche pour compléter sa session.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'
import { emailSchema } from '@/lib/auth/validation'
import { reportSignIn } from '@/lib/notify/client'

export default function AdminConsolePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [phase, setPhase] = useState<'credentials' | 'mfa'>('credentials')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  // Déjà connecté en tant qu'admin ? On ouvre directement le back-office.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: isAdmin } = await supabase.rpc('is_admin')
          if (active && isAdmin === true) { router.replace('/admin'); return }
        }
      } catch { /* ignore */ }
      if (active) setChecking(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Rôle admin vérifié en base puis ouverture du back-office. Sinon : accès refusé. */
  const openAdmin = async () => {
    const supabase = createClient()
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (isAdmin !== true) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      setLoading(false)
      setPhase('credentials')
      setError('Ce compte n’a pas accès à l’administration.')
      return
    }
    await reportSignIn()
    router.replace('/admin')
    router.refresh()
  }

  /** Un facteur TOTP vérifié existe et la session est en aal1 : on passe à l'étape code. */
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

  const signIn = async () => {
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success || !password) {
      setError('Saisissez une adresse e-mail valide et votre mot de passe.')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email: parsed.data, password })
    if (err) {
      setLoading(false)
      setError(authErrorMessage(err, 'signin'))
      return
    }
    setPassword('')
    if (await needsMfa()) { setLoading(false); return }
    await openAdmin()
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
    await openAdmin()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (phase === 'mfa') void verifyMfa(code)
    else void signIn()
  }

  const field = 'h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-[15px] text-white placeholder:text-slate-500 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/30'

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      {/* halo sobre, back-office */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-sky-500/10 blur-3xl" />
      <section className="relative w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <ShieldCheck className="h-6 w-6 text-sky-400" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Espace administration</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-400">
            {phase === 'mfa' ? 'Saisissez le code de votre application d’authentification.' : 'Connexion réservée à l’équipe Lien Parental.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          {phase === 'credentials' ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-300">E-mail</span>
                <input
                  type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                  placeholder="admin@lienparental.fr" value={email}
                  onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined}
                  className={field} autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-300">Mot de passe</span>
                <input
                  type="password" autoComplete="current-password" placeholder="Votre mot de passe"
                  value={password} onChange={(e) => setPassword(e.target.value)} className={field}
                />
              </label>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-slate-300">Code à 6 chiffres</span>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
                placeholder="000000" value={code} autoFocus
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (error) setError(null) }}
                className={`${field} text-center text-lg tracking-[0.5em]`}
              />
            </label>
          )}

          <div className="mt-3 min-h-[20px]" aria-live="polite">
            {error && <p role="alert" className="text-[13px] font-medium text-rose-400">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || checking || (phase === 'mfa' && code.length !== 6)}
            aria-busy={loading}
            className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 font-semibold text-white transition hover:bg-sky-400 active:scale-[0.99] disabled:opacity-50"
          >
            {(loading || checking) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {phase === 'mfa' ? (loading ? 'Vérification…' : 'Vérifier') : (loading ? 'Connexion…' : 'Se connecter')}
          </button>

          {phase === 'mfa' && (
            <button
              type="button"
              onClick={() => { setPhase('credentials'); setFactorId(null); setCode(''); setError(null); void createClient().auth.signOut({ scope: 'local' }).catch(() => undefined) }}
              className="mt-3 block w-full text-center text-[13px] text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
            >
              Utiliser un autre compte
            </button>
          )}
        </form>

        <p className="mt-6 text-center text-[12px] text-slate-500">Lien Parental · back-office sécurisé</p>
      </section>
    </main>
  )
}
