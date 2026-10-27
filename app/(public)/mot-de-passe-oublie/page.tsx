'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { TextField } from '@/components/onboarding/fields'
import { btn } from '@/components/onboarding/styles'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { emailSchema } from '@/lib/auth/validation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Mot de passe oublié — même grammaire visuelle que l'onboarding (écran 5).
export default function MotDePasseOubliePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  // Retour d'un lien de réinitialisation expiré (/auth/confirm, POST → ?erreur=lien).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('erreur') === 'lien') {
      setError('Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.')
    }
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim()) || loading) {
      if (!loading) setError('Indiquez une adresse e-mail valide.')
      return
    }
    setError(undefined)
    if (SUPABASE_ENABLED) {
      const parsed = emailSchema.safeParse(email)
      if (!parsed.success) { setError('Indiquez une adresse e-mail valide.'); return }
      setLoading(true)
      // Lien envoyé par NOTRE e-mail (POST /api/auth/password-reset, generateLink recovery).
      // Réponse identique que le compte existe ou non ; seules les limites de débit et les pannes sont signalées.
      let err: string | null = null
      try {
        const res = await fetch('/api/auth/password-reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ email: parsed.data }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
          err = data?.error?.message ?? 'Envoi impossible pour le moment. Réessayez dans un instant.'
        }
      } catch {
        err = 'Connexion impossible. Vérifiez votre réseau puis réessayez.'
      }
      setLoading(false)
      if (err) {
        setError(err)
        return
      }
    }
    setSent(true)
  }

  return (
    <main className="flex flex-1 flex-col">
      {!sent ? (
        <OnboardingScreen
          back="/onboarding/connexion"
          title="Mot de passe oublié ?"
          subtitle="Indiquez l’e-mail associé à votre compte : nous vous enverrons un lien pour en créer un nouveau."
          onSubmit={onSubmit}
          footer={
            <button type="submit" className={cn(btn.primary, 'w-full')} disabled={loading} aria-busy={loading}>
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          }
        >
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
            error={error}
          />
        </OnboardingScreen>
      ) : (
        <OnboardingScreen
          back="/onboarding/connexion"
          align="center"
          media={
            <span className="mx-auto mb-5 mt-10 grid h-20 w-20 place-items-center rounded-full bg-leaf-50 text-leaf-600" aria-hidden="true">
              <MailCheck className="h-9 w-9" />
            </span>
          }
          title="Lien envoyé"
          subtitle={
            <span aria-live="polite">
              Si un compte existe pour <strong className="text-night-900">{email}</strong>, vous recevrez un e-mail dans
              quelques minutes.
            </span>
          }
          footer={
            <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => router.push('/onboarding/connexion')}>
              Retour à la connexion
            </button>
          }
        />
      )}
    </main>
  )
}
