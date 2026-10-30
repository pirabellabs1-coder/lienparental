'use client'

import { useRouter } from 'next/navigation'
import { usePrefetch } from '@/components/mobile/usePrefetch'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { TextField } from '@/components/onboarding/fields'
import { PhotoPicker } from '@/components/onboarding/PhotoPicker'
import { TerritoryPicker } from '@/components/onboarding/TerritoryPicker'
import { rememberGuideTerritory } from '@/components/guide/RememberGuideTerritory'
import { GUIDE_TERRITORY_COOKIE, isTerritoryCode } from '@/lib/guide/territories'
import { btn } from '@/components/onboarding/styles'
import { getDraftPhoto, readDraft, setDraftPhoto, writeDraft } from '@/components/onboarding/draft'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { saveOnboardingProfile } from '@/lib/auth/actions'
import { uploadAvatar } from '@/lib/auth/browser'

// Étape 8 — Configurer votre profil (photo facultative, prénom, nom, territoire du Guide parental)
export default function ProfilPage() {
  const router = useRouter()
  // Écran suivant préchargé jusqu'à son squelette (loading.tsx) : retour immédiat au clic.
  usePrefetch('/onboarding/enfant')
  const t = useTranslations('public.onboarding.profile')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [territoire, setTerritoire] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const d = readDraft()
    setPrenom(d.prenom ?? '')
    setNom(d.nom ?? '')
    setPhoto(getDraftPhoto('parent'))
    // Brouillon, sinon dernier territoire consulté dans le Guide (cookie) : rien d'imposé par défaut.
    const fromCookie = document.cookie.split('; ').find((c) => c.startsWith(`${GUIDE_TERRITORY_COOKIE}=`))?.split('=')[1]
    const guess = d.territoire ?? (fromCookie ? decodeURIComponent(fromCookie) : '')
    if (isTerritoryCode(guess)) setTerritoire(guess)
  }, [])

  const onPhoto = (url: string | null) => {
    setDraftPhoto('parent', url)
    setPhoto(url)
  }

  const prenomErr = submitted && !prenom.trim() ? t('errFirstName') : undefined
  const nomErr = submitted && !nom.trim() ? t('errLastName') : undefined
  const territoireErr = submitted && !territoire ? t('errTerritory') : undefined

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
    const res = await saveOnboardingProfile({ prenom: prenom.trim(), nom: nom.trim(), photoPath, territoire })
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
    if (!prenom.trim() || !nom.trim() || !territoire || saving) return
    if (SUPABASE_ENABLED && !(await persist())) return
    // Démo : pas de profil en base, le cookie suffit pour que le Guide s'ouvre sur ce territoire.
    if (!SUPABASE_ENABLED) rememberGuideTerritory(territoire)
    writeDraft({ prenom: prenom.trim(), nom: nom.trim(), territoire })
    router.push('/onboarding/enfant')
  }

  return (
    <OnboardingScreen
      step={7}
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
      <TerritoryPicker
        className="mt-7"
        value={territoire}
        onChange={setTerritoire}
        legend={t('territoryLegend')}
        help={t('territoryHelp')}
        error={territoireErr}
      />
    </OnboardingScreen>
  )
}
