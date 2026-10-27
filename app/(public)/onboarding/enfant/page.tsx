'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen'
import { SelectField, TextField, childClassKey } from '@/components/onboarding/fields'
import { PhotoPicker } from '@/components/onboarding/PhotoPicker'
import { btn } from '@/components/onboarding/styles'
import { getDraftPhoto, readDraft, setDraftPhoto, writeDraft } from '@/components/onboarding/draft'
import { CHILD_CLASSES } from '@/lib/mock-data'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { removeOnboardingChild, saveOnboardingChild } from '@/lib/auth/actions'
import { uploadAvatar } from '@/lib/auth/browser'

// Étape 9 — Ajouter un enfant (proposé) : photo, prénom, date de naissance, classe.
export default function EnfantPage() {
  const router = useRouter()
  const t = useTranslations('public.onboarding.child')
  const tc = useTranslations('public.onboarding.classes')
  const [photo, setPhoto] = useState<string | null>(null)
  const [prenom, setPrenom] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [classe, setClasse] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [childId, setChildId] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const c = readDraft().child
    if (c) {
      setPrenom(c.prenom)
      setDateNaissance(c.dateNaissance)
      setClasse(c.classe ?? '')
      setChildId(c.id)
    }
    setPhoto(getDraftPhoto('child'))
  }, [])

  const onPhoto = (url: string | null) => {
    setDraftPhoto('child', url)
    setPhoto(url)
  }

  const prenomErr = submitted && !prenom.trim() ? t('errFirstName') : undefined
  const dateErr =
    submitted && (!dateNaissance || dateNaissance > today) ? t('errBirthDate') : undefined

  const onAuthLost = (reason?: string) => {
    if (reason === 'unauthenticated' || reason === 'mfa_required') {
      router.push('/onboarding/connexion')
      return true
    }
    return false
  }

  // Supabase : insertion dans public.children (RLS). L'id est généré ici pour
  // nommer la photo (${uid}/children/<id>.jpg) et rendre la ré-édition idempotente.
  const persist = async (): Promise<string | null> => {
    setSaving(true)
    setServerError(null)
    const id = childId ?? crypto.randomUUID()
    let photoPath: string | null = null
    if (photo) {
      const up = await uploadAvatar(photo, `children/${id}`)
      if (!up.ok) { setSaving(false); setServerError(up.error); return null }
      photoPath = up.path
    }
    const res = await saveOnboardingChild({ id, prenom: prenom.trim(), dateNaissance, classe: classe || null, photoPath })
    if (!res.ok) {
      setSaving(false)
      if (!onAuthLost(res.reason)) setServerError(res.error)
      return null
    }
    return res.data.id
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!prenom.trim() || !dateNaissance || dateNaissance > today || saving) return
    let id: string | undefined
    if (SUPABASE_ENABLED) {
      const saved = await persist()
      if (!saved) return
      id = saved
    }
    writeDraft({ child: { id, prenom: prenom.trim(), dateNaissance, classe: classe || undefined } })
    router.push('/onboarding/recap')
  }

  const skip = async () => {
    if (saving) return
    // Enfant déjà enregistré puis « plus tard » depuis le récapitulatif : on le retire.
    if (SUPABASE_ENABLED && childId) {
      setSaving(true)
      const res = await removeOnboardingChild(childId)
      setSaving(false)
      if (!res.ok) {
        if (!onAuthLost(res.reason)) setServerError(res.error)
        return
      }
    }
    writeDraft({ child: null })
    setDraftPhoto('child', null)
    router.push('/onboarding/recap')
  }

  return (
    <OnboardingScreen
      step={9}
      align="center"
      title={
        <>
          {t('titleLine1')}
          <br />{t('titleLine2')}
        </>
      }
      subtitle={t('subtitle')}
      onSubmit={onSubmit}
      footer={
        <>
          {serverError && <p role="alert" className="text-center text-sm font-semibold text-alert-600">{serverError}</p>}
          <button type="submit" className={cn(btn.primary, 'w-full')} disabled={saving} aria-busy={saving}>
            {saving ? t('saving') : t('submit')}
          </button>
          <button
            type="button"
            onClick={() => void skip()}
            disabled={saving}
            className="inline-flex min-h-[44px] w-full items-center justify-center text-[13px] font-bold text-leaf-600 underline-offset-4 hover:underline"
          >
            {t('later')}
          </button>
        </>
      }
    >
      <PhotoPicker kind="child" value={photo} onChange={onPhoto} className="flex justify-center" />
      <div className="mt-6 space-y-4">
        <TextField
          label={t('firstName')}
          required
          autoComplete="off"
          placeholder={t('firstNamePh')}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          error={prenomErr}
        />
        <TextField
          label={t('birthDate')}
          required
          type="date"
          max={today}
          value={dateNaissance}
          onChange={(e) => setDateNaissance(e.target.value)}
          error={dateErr}
        />
        <SelectField
          label={t('class')}
          optional
          placeholder={t('select')}
          options={CHILD_CLASSES.map((c) => {
            const k = childClassKey(c)
            return { value: c, label: k ? tc(k) : c }
          })}
          value={classe}
          onChange={(e) => setClasse(e.target.value)}
        />
      </div>
    </OnboardingScreen>
  )
}
