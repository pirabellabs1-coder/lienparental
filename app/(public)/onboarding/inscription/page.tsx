'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { Mail, User } from 'lucide-react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { TextField } from '@/components/onboarding/fields'
import { PasswordField, PASSWORD_RULES } from '@/components/onboarding/PasswordField'
import { btn } from '@/components/onboarding/styles'
import { GoogleButton, OrSeparator } from '@/components/auth/GoogleButton'
import { readDraft, writeDraft } from '@/components/onboarding/draft'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'
import { appUrl } from '@/lib/auth/redirect'
import { emailSchema, nameSchema, passwordSchema } from '@/lib/auth/validation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_TAKEN = 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.'

// Étape 6 — Créer votre compte (formule gratuite par défaut, à appliquer côté backend).
export default function InscriptionPage() {
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const d = readDraft()
    if (d.prenom) setPrenom(d.prenom)
    if (d.nom) setNom(d.nom)
    if (d.email) setEmail(d.email)
  }, [])

  const errors = {
    prenom: !prenom.trim() ? 'Indiquez votre prénom.' : undefined,
    nom: !nom.trim() ? 'Indiquez votre nom.' : undefined,
    email: !EMAIL_RE.test(email.trim()) ? 'Indiquez une adresse e-mail valide.' : undefined,
    password: !PASSWORD_RULES.every((r) => r.test(password)) ? 'Le mot de passe ne respecte pas encore toutes les règles.' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  // Supabase : création du compte + envoi du code à 6 chiffres (modèle « Confirm signup » avec {{ .Token }}).
  // Le mot de passe part directement vers Supabase Auth (TLS) et n'est jamais stocké côté navigateur.
  const signUp = async () => {
    const parsed = {
      prenom: nameSchema.safeParse(prenom),
      nom: nameSchema.safeParse(nom),
      email: emailSchema.safeParse(email),
      password: passwordSchema.safeParse(password),
    }
    if (!parsed.prenom.success || !parsed.nom.success || !parsed.email.success || !parsed.password.success) {
      setServerError('Vérifiez les informations saisies.')
      return
    }
    setLoading(true)
    setServerError(null)
    const { data, error } = await createClient().auth.signUp({
      email: parsed.email.data,
      password: parsed.password.data,
      options: {
        data: { prenom: parsed.prenom.data, nom: parsed.nom.data },
        emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding/profil`,
      },
    })
    if (error) {
      setLoading(false)
      setServerError(authErrorMessage(error, 'signup'))
      return
    }
    // Adresse déjà inscrite : GoTrue répond « succès » sans identité (anti-énumération).
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setLoading(false)
      setServerError(EMAIL_TAKEN)
      return
    }
    writeDraft({ prenom: parsed.prenom.data, nom: parsed.nom.data, email: parsed.email.data })
    setPassword('')
    // Confirmation e-mail désactivée dans Supabase : la session est déjà ouverte.
    router.push(data.session ? '/onboarding/profil' : '/onboarding/verification')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!valid || loading) return
    if (SUPABASE_ENABLED) {
      void signUp()
      return
    }
    writeDraft({ prenom: prenom.trim(), nom: nom.trim(), email: email.trim() })
    router.push('/onboarding/verification')
  }

  return (
    <OnboardingScreen
      step={6}
      title="Créer votre compte"
      subtitle="Quelques informations pour démarrer votre espace."
      onSubmit={onSubmit}
      footer={
        <>
          <p className="text-center text-xs leading-relaxed text-night-500">
            En continuant, vous acceptez les{' '}
            <Link href="/legal/cgu" className="font-semibold text-night-700 underline underline-offset-2">
              conditions d’utilisation
            </Link>{' '}
            et la{' '}
            <Link href="/legal/confidentialite" className="font-semibold text-night-700 underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
          {serverError && (
            <p role="alert" className="text-center text-sm font-semibold text-alert-600">
              {serverError}
              {serverError === EMAIL_TAKEN && (
                <>
                  {' '}
                  <Link href="/onboarding/connexion" className="underline underline-offset-2">Se connecter</Link>
                </>
              )}
            </p>
          )}
          <button type="submit" className={cn(btn.primary, 'w-full')} disabled={loading} aria-busy={loading}>
            {loading ? 'Création du compte…' : 'Continuer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Nouveau compte Google : le callback enchaîne sur l'onboarding (premier enfant). */}
        <GoogleButton next="/app" />
        <OrSeparator className="py-1" />
        <TextField
          label="Prénom"
          required
          autoComplete="given-name"
          placeholder="Votre prénom"
          icon={<User className="h-[18px] w-[18px]" />}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          error={submitted ? errors.prenom : undefined}
        />
        <TextField
          label="Nom"
          required
          autoComplete="family-name"
          placeholder="Votre nom"
          icon={<User className="h-[18px] w-[18px]" />}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          error={submitted ? errors.nom : undefined}
        />
        <TextField
          label="E-mail"
          required
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="exemple@email.com"
          icon={<Mail className="h-[18px] w-[18px]" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={submitted ? errors.email : undefined}
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onValueChange={setPassword}
          showRules
          autoComplete="new-password"
          placeholder="Votre mot de passe"
          errorText={submitted ? errors.password : undefined}
        />
      </div>
    </OnboardingScreen>
  )
}
