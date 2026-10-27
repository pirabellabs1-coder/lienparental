'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { SelectField, TextField } from '@/components/onboarding/fields'
import { PhotoPicker } from '@/components/onboarding/PhotoPicker'
import { btn } from '@/components/onboarding/styles'
import { BackButton, EnfantsHeader } from '@/components/enfants/EnfantsHeader'
import { CHILD_CLASSES } from '@/lib/mock-data'
import { createChild } from '@/lib/data/children'
import { useChildLabels } from '@/components/enfants/childLabels'

// M04 — Ajouter un enfant (même formulaire que l'étape 9 de l'onboarding).
// RLS Supabase : insert dans `children` avec user_id = auth.uid().
export default function NouvelEnfantPage() {
  const t = useTranslations('family.children.form')
  const labels = useChildLabels()
  const router = useRouter()
  const [photo, setPhoto] = useState<string | null>(null)
  const [prenom, setPrenom] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [classe, setClasse] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo)
  }, [photo])

  const prenomErr = submitted && !prenom.trim() ? t('firstNameRequired') : undefined
  const dateErr = submitted && (!dateNaissance || dateNaissance > today) ? t('birthDateInvalid') : undefined

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!prenom.trim() || !dateNaissance || dateNaissance > today) return
    setSaving(true)
    setSaveError(null)
    try {
      // Supabase : insert children (user_id issu de la session). Démo : aucune persistance.
      // La photo reste locale (aperçu) : upload Storage à brancher avec le bucket « avatars ».
      await createChild({ prenom: prenom.trim(), dateNaissance, classe: classe || undefined })
      router.push('/app/enfants')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('saveFailed'))
      setSaving(false)
    }
  }

  return (
    <div className="w-full px-4 pb-8 md:px-6">
      <EnfantsHeader title={t('addTitle')} left={<BackButton href="/app/enfants" />} />

      <form onSubmit={onSubmit} noValidate className="mt-4">
        <PhotoPicker kind="child" value={photo} onChange={setPhoto} className="flex justify-center" />
        <div className="mt-6 space-y-4">
          <TextField label={t('firstName')} required placeholder={t('firstNamePlaceholder')} value={prenom} onChange={(e) => setPrenom(e.target.value)} error={prenomErr} />
          <TextField
            label={t('birthDate')}
            required
            type="date"
            max={today}
            value={dateNaissance}
            onChange={(e) => setDateNaissance(e.target.value)}
            error={dateErr}
          />
          <SelectField label={t('class')} optional placeholder={t('select')} options={labels.classOptions(CHILD_CLASSES)} value={classe} onChange={(e) => setClasse(e.target.value)} />
        </div>
        {saveError && (
          <p role="alert" className="mt-6 text-center text-sm font-semibold text-alert-600">
            {saveError}
          </p>
        )}
        <button type="submit" className={cn(btn.primary, 'mt-8 w-full')} disabled={saving} aria-busy={saving}>
          {saving ? t('saving') : t('addSubmit')}
        </button>
      </form>
    </div>
  )
}
