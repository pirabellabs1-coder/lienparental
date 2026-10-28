'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useLocalePath } from '@/components/i18n/useLocalePath'
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
import { emailSchema, nameSchema, passwordSchema } from '@/lib/auth/validation'
import { setPendingPassword } from '@/lib/auth/pending-password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Appel JSON d'une route d'authentification : message d'erreur (serveur ou repli localisé) ou null. */
async function postAuth(url: string, body: unknown, fallbacks: { unavailable: string; network: string }): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
    if (res.ok) return null
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    return data?.error?.message ?? fallbacks.unavailable
  } catch {
    return fallbacks.network
  }
}

// Étape 6 — Créer votre compte (formule gratuite par défaut, à appliquer côté backend).
export default function InscriptionPage() {
  const router = useRouter()
  const t = useTranslations('onb.signup')
  const lp = useLocalePath()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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
    prenom: !prenom.trim() ? t('errFirstName') : undefined,
    nom: !nom.trim() ? t('errLastName') : undefined,
    email: !EMAIL_RE.test(email.trim()) ? t('errEmail') : undefined,
    password: !PASSWORD_RULES.every((r) => r.test(password)) ? t('errPassword') : undefined,
    confirm: confirm !== password ? t('errPasswordMatch') : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  // Supabase : le serveur crée le compte avec un mot de passe ALÉATOIRE (POST /api/auth/signup) et envoie
  // le code par NOTRE e-mail. Le mot de passe choisi ne quitte pas le navigateur : gardé en mémoire, il est
  // posé après vérification du code (anti pré-détournement de compte). Réponse neutre : adresse déjà
  // inscrite ou non, on passe à l'étape code (le titulaire d'une adresse inscrite est prévenu par e-mail).
  const signUp = async () => {
    const parsed = {
      prenom: nameSchema.safeParse(prenom),
      nom: nameSchema.safeParse(nom),
      email: emailSchema.safeParse(email),
      password: passwordSchema.safeParse(password),
    }
    if (!parsed.prenom.success || !parsed.nom.success || !parsed.email.success || !parsed.password.success || confirm !== password) {
      setServerError(t('errCheck'))
      return
    }
    setLoading(true)
    setServerError(null)
    const err = await postAuth('/api/auth/signup', { email: parsed.email.data }, { unavailable: t('errUnavailable'), network: t('errNetwork') })
    if (err) {
      setLoading(false)
      setServerError(err)
      return
    }
    writeDraft({ prenom: parsed.prenom.data, nom: parsed.nom.data, email: parsed.email.data })
    setPendingPassword(parsed.email.data, parsed.password.data)
    // Ne PAS vider les champs ici : `submitted` est vrai, un champ vide afficherait l'erreur rouge
    // « mot de passe invalide » pendant la navigation. L'état disparaît avec l'écran (démontage) ;
    // le mot de passe n'est conservé que par setPendingPassword, en mémoire, jusqu'à la vérification du code.
    router.push('/onboarding/verification')
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
      title={t('title')}
      subtitle={t('subtitle')}
      onSubmit={onSubmit}
      footer={
        <>
          <p className="text-center text-xs leading-relaxed text-night-500">
            {t('termsBefore')}
            <Link href={lp('/legal/cgu')} className="font-semibold text-night-700 underline underline-offset-2">
              {t('termsLink')}
            </Link>
            {t('termsMiddle')}
            <Link href={lp('/legal/confidentialite')} className="font-semibold text-night-700 underline underline-offset-2">
              {t('privacyLink')}
            </Link>
            {t('termsAfter')}
          </p>
          {serverError && (
            <p role="alert" className="text-center text-sm font-semibold text-alert-600">
              {serverError}
            </p>
          )}
          <button type="submit" className={cn(btn.primary, 'w-full')} disabled={loading} aria-busy={loading}>
            {loading ? t('creating') : t('continue')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Nouveau compte Google : le callback enchaîne sur l'onboarding (premier enfant). */}
        <GoogleButton next="/app" />
        <OrSeparator className="py-1" />
        <TextField
          label={t('firstName')}
          required
          autoComplete="given-name"
          placeholder={t('firstNamePlaceholder')}
          icon={<User className="h-[18px] w-[18px]" />}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          error={submitted ? errors.prenom : undefined}
        />
        <TextField
          label={t('lastName')}
          required
          autoComplete="family-name"
          placeholder={t('lastNamePlaceholder')}
          icon={<User className="h-[18px] w-[18px]" />}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          error={submitted ? errors.nom : undefined}
        />
        <TextField
          label={t('email')}
          required
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('emailPlaceholder')}
          icon={<Mail className="h-[18px] w-[18px]" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={submitted ? errors.email : undefined}
        />
        <PasswordField
          value={password}
          onValueChange={setPassword}
          showRules
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
          errorText={submitted ? errors.password : undefined}
        />
        <PasswordField
          label={t('confirmPassword')}
          value={confirm}
          onValueChange={setConfirm}
          autoComplete="new-password"
          placeholder={t('confirmPasswordPlaceholder')}
          errorText={submitted ? errors.confirm : undefined}
        />
      </div>
    </OnboardingScreen>
  )
}
