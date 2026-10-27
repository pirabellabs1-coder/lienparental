'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { TextField } from '@/components/onboarding/fields'
import { PhotoPicker } from '@/components/onboarding/PhotoPicker'
import { btn } from '@/components/onboarding/styles'
import { getDraftPhoto, readDraft, setDraftPhoto, writeDraft } from '@/components/onboarding/draft'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { saveOnboardingProfile } from '@/lib/auth/actions'
import { uploadAvatar } from '@/lib/auth/browser'

// Étape 8 — Configurer votre profil (photo facultative, prénom, nom)
export default function ProfilPage() {
  const router = useRouter()
  const t = useTranslations('public.onboarding.profile')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const d = readDraft()
    setPrenom(d.prenom ?? '')
    setNom(d.nom ?? '')
    setPhoto(getDraftPhoto('parent'))
  }, [])

  const onPhoto = (url: string | null) => {
    setDraftPhoto('parent', url)
    setPhoto(url)
  }

  const prenomErr = submitted && !prenom.trim() ? t('errFirstName') : undefined
  const nomErr = submitted && !nom.trim() ? t('errLastName') : undefined

  // Supabase : photo → bucket privé « avatars » (${uid}/avatar.jpg), puis public.users via Server Action.
  const persist = async () => {
    setSaving(true)
    setServerError(null)
    let photoPath: string | null = null
    if (photo) {
      const up = await uploadAvatar(photo, 'avatar')
      if (!up.ok) { setSaving(false); setServerError(up.error); return false }
      photoPath = up.path
    }
    const res = await saveOnboardingProfile({ prenom: prenom.trim(), nom: nom.trim(), photoPath })
    if (!res.ok) {
      setSaving(false)
      if (res.reason === 'unauthenticated' || res.reason === 'mfa_required') {
        router.push('/onboarding/connexion')
        return false
      }
      setServerError(res.error)
      return false
    }
    return true
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!prenom.trim() || !nom.trim() || saving) return
    if (SUPABASE_ENABLED && !(await persist())) return
    writeDraft({ prenom: prenom.trim(), nom: nom.trim() })
    router.push('/onboarding/enfant')
  }

  return (
    <OnboardingScreen
      step={8}
      title={t('title')}
      subtitle={t('subtitle')}
      onSubmit={onSubmit}
      footer={
        <>
          {serverError && <p role="alert" className="text-center text-sm font-semibold text-alert-600">{serverError}</p>}
          <button type="submit" className={cn(btn.primary, 'w-full')} disabled={saving} aria-busy={saving}>
            {saving ? t('saving') : t('continue')}
          </button>
        </>
      }
    >
      <PhotoPicker kind="parent" value={photo} onChange={onPhoto} className="flex justify-center" />
      <div className="mt-7 space-y-4">
        <TextField
          label={t('firstName')}
          required
          autoComplete="given-name"
          placeholder={t('firstNamePh')}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          error={prenomErr}
        />
        <TextField
          label={t('lastName')}
          required
          autoComplete="family-name"
          placeholder={t('lastNamePh')}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          error={nomErr}
        />
      </div>
    </OnboardingScreen>
  )
}
