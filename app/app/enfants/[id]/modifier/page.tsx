'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, HeartPulse, Lock, PersonStanding, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ConfirmDialog } from '@/components/ui'
import { SelectField, TextField } from '@/components/onboarding/fields'
import { btn } from '@/components/onboarding/styles'
import { EnfantsHeader } from '@/components/enfants/EnfantsHeader'
import { useChild } from '@/components/enfants/useChild'
import { HealthPrivacyNote } from '@/components/enfants/HealthPrivacyNote'
import { LoadingState } from '@/components/mobile/StateScreens'
import { removeChild } from '@/lib/data/children'
import { useChildLabels } from '@/components/enfants/childLabels'
import {
  ALLERGY_SUGGESTIONS,
  BLOOD_GROUPS,
  CHILD_CLASSES,
  EYE_COLORS,
  HAIR_COLORS,
  type Child,
} from '@/lib/mock-data'

type Form = {
  prenom: string
  dateNaissance: string
  classe: string
  taille: string
  poids: string
  couleurYeux: string
  couleurCheveux: string
  allergies: string[]
  autresAllergies: string
  infosMedicales: string
  groupeSanguin: string
  traitement: string
  medecinTraitant: string
}

function toForm(c: Child): Form {
  return {
    prenom: c.prenom,
    dateNaissance: c.dateNaissance ?? '',
    classe: c.classe ?? '',
    taille: c.taille ? String(c.taille) : '',
    poids: c.poids ? String(c.poids) : '',
    couleurYeux: c.couleurYeux ?? '',
    couleurCheveux: c.couleurCheveux ?? '',
    allergies: c.allergies ?? [],
    autresAllergies: c.autresAllergies ?? '',
    infosMedicales: c.infosMedicales ?? '',
    groupeSanguin: c.groupeSanguin ?? '',
    traitement: c.traitement ?? '',
    medecinTraitant: c.medecinTraitant ?? '',
  }
}

const num = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined
}

// M04 — Modifier le profil (2 étapes : générales + physiques, puis médicales).
export default function ModifierEnfantPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('family.children.form')
  const labels = useChildLabels()
  const { id } = use(params)
  const router = useRouter()
  const { child, save, loading } = useChild(id)
  const [saveError, setSaveError] = useState<string | null>(null)
  const initial = useMemo(() => (child ? toForm(child) : null), [child])

  const [form, setForm] = useState<Form | null>(initial)
  const [step, setStep] = useState<1 | 2>(1)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  // Re-sync once session overrides are hydrated (only if the user hasn't typed yet).
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched && initial) setForm(initial)
  }, [initial, touched])

  const [stepChanged, setStepChanged] = useState(false)
  useEffect(() => {
    if (stepChanged) document.getElementById('edit-step-title')?.focus()
  }, [step, stepChanged])

  if (!child && loading) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <LoadingState compact title={t('loadingProfile')} description="" />
      </div>
    )
  }

  if (!child || !form) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <p className="mt-10 text-center text-sm text-night-600">{t('notFound')}</p>
        <Link href="/app/enfants" className={cn(btn.secondary, 'mt-6 w-full')}>
          {t('backToChildren')}
        </Link>
      </div>
    )
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setTouched(true)
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  const errors = {
    prenom: !form.prenom.trim() ? t('firstNameRequired') : undefined,
    dateNaissance:
      !form.dateNaissance || form.dateNaissance > today ? t('birthDateInvalid') : undefined,
    taille: form.taille && !num(form.taille) ? t('heightInvalid') : undefined,
    poids: form.poids && !num(form.poids) ? t('weightInvalid') : undefined,
  }
  const step1Valid = !Object.values(errors).some(Boolean)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const doSave = async () => {
    setSubmitted(true)
    if (!step1Valid) {
      setStep(1)
      return
    }
    setSaving(true)
    setSaveError(null)
    // Supabase : update children (RLS) ; champs médicaux chiffrés AES-256-GCM côté serveur.
    try {
    const shared = child?.mine === false
    await save({
      prenom: form.prenom.trim(),
      dateNaissance: form.dateNaissance,
      classe: form.classe,
      taille: num(form.taille),
      poids: num(form.poids),
      couleurYeux: form.couleurYeux || undefined,
      couleurCheveux: form.couleurCheveux || undefined,
      // Fiche partagée : informations médicales réservées au parent qui a créé la fiche.
      ...(shared ? {} : {
      allergies: form.allergies,
      autresAllergies: form.autresAllergies.trim() || undefined,
      infosMedicales: form.infosMedicales.trim() || undefined,
      groupeSanguin: form.groupeSanguin || undefined,
      traitement: form.traitement.trim() || undefined,
      medecinTraitant: form.medecinTraitant.trim() || undefined,
      }),
    })
    router.push(`/app/enfants/${id}?vue=recap`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('saveFailed'))
      setSaving(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 1) {
      setSubmitted(true)
      if (step1Valid) {
        setStepChanged(true)
        setStep(2)
      }
      return
    }
    void doSave()
  }

  const cancel = () => (dirty ? setConfirmCancel(true) : router.push(`/app/enfants/${id}`))
  const remaining = ALLERGY_SUGGESTIONS.filter((a) => !form.allergies.includes(a))

  return (
    <div className="w-full px-4 pb-8 md:px-6">
      <EnfantsHeader
        title={t('editTitle')}
        left={
          <button type="button" onClick={cancel} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-night-700 hover:text-night-900">
            {t('cancel')}
          </button>
        }
        right={
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={saving}
            className="min-h-[44px] rounded-lg px-2 text-sm font-bold text-leaf-600 hover:text-leaf-700 disabled:opacity-50"
          >
            {t('save')}
          </button>
        }
      />

      <form onSubmit={onSubmit} noValidate className="mt-3">
        <p className="sr-only" aria-live="polite">
          {t('step', { step, total: 2 })}
        </p>

        {step === 1 ? (
          <>
            <SectionTitle id="edit-step-title" icon={<CalendarDays className="h-[18px] w-[18px]" />}>
              {t('sectionGeneral')}
            </SectionTitle>
            <div className="mt-4 space-y-4">
              <TextField label={t('firstName')} required value={form.prenom} onChange={(e) => set('prenom', e.target.value)} error={submitted ? errors.prenom : undefined} />
              <TextField
                label={t('birthDate')}
                required
                type="date"
                max={today}
                value={form.dateNaissance}
                onChange={(e) => set('dateNaissance', e.target.value)}
                error={submitted ? errors.dateNaissance : undefined}
              />
              <SelectField label={t('class')} placeholder={t('select')} options={labels.classOptions(CHILD_CLASSES)} value={form.classe} onChange={(e) => set('classe', e.target.value)} />
            </div>

            <SectionTitle icon={<PersonStanding className="h-[18px] w-[18px]" />} className="mt-8">
              {t('sectionPhysical')}
            </SectionTitle>
            <div className="mt-4 space-y-4">
              <TextField
                label={t('height')}
                optional
                inputMode="decimal"
                suffix="cm"
                value={form.taille}
                onChange={(e) => set('taille', e.target.value)}
                error={submitted ? errors.taille : undefined}
              />
              <TextField
                label={t('weight')}
                optional
                inputMode="decimal"
                suffix="kg"
                value={form.poids}
                onChange={(e) => set('poids', e.target.value)}
                error={submitted ? errors.poids : undefined}
              />
              <SelectField label={t('eyeColor')} optional placeholder={t('select')} options={labels.options(EYE_COLORS, labels.eyeLabel)} value={form.couleurYeux} onChange={(e) => set('couleurYeux', e.target.value)} />
              <SelectField label={t('hairColor')} optional placeholder={t('select')} options={labels.options(HAIR_COLORS, labels.hairLabel)} value={form.couleurCheveux} onChange={(e) => set('couleurCheveux', e.target.value)} />
            </div>

            <div className="mt-8 flex justify-end">
              <button type="submit" className={cn(btn.primary, 'px-10')}>
                {t('next')}
              </button>
            </div>
          </>
        ) : (
          <>
            <SectionTitle id="edit-step-title" icon={<HeartPulse className="h-[18px] w-[18px]" />}>
              {t('sectionMedical')}
            </SectionTitle>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-night-500">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <HealthPrivacyNote childId={id} />
            </p>
            {child.mine === false && (
              <p className="mt-3 rounded-xl bg-night-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-night-700">{t('medicalOwnerOnly')}</p>
            )}

            <fieldset disabled={child.mine === false} className="mt-4 space-y-4 disabled:opacity-60">
              <div>
                <span id="allergies-label" className="mb-1.5 block text-[13px] font-bold text-night-900">
                  {t('allergies')} <span className="font-medium text-night-500">{t('optional')}</span>
                </span>
                <div className="relative flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-xl border border-night-100 bg-white py-1.5 pl-2 pr-10 focus-within:border-leaf-500 focus-within:ring-4 focus-within:ring-leaf-100">
                  <ul className="contents" aria-labelledby="allergies-label">
                    {form.allergies.map((a) => (
                      <li key={a} className="inline-flex items-center gap-0.5 rounded-lg bg-night-50 py-0.5 pl-2.5 pr-0.5 text-[13px] font-semibold text-night-800">
                        {labels.allergyLabel(a)}
                        <button
                          type="button"
                          onClick={() => set('allergies', form.allergies.filter((x) => x !== a))}
                          aria-label={t('removeAllergy', { name: labels.allergyLabel(a) })}
                          className="grid h-7 w-7 place-items-center rounded-md text-night-500 hover:bg-night-100 hover:text-night-900"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <select
                    aria-label={t('addAllergy')}
                    value=""
                    onChange={(e) => e.target.value && set('allergies', [...form.allergies, e.target.value])}
                    disabled={remaining.length === 0}
                    className="h-9 min-w-[7.5rem] flex-1 cursor-pointer appearance-none bg-transparent pl-2 text-base text-night-400 outline-none disabled:cursor-default"
                  >
                    <option value="">{form.allergies.length ? t('addMore') : t('select')}</option>
                    {remaining.map((a) => (
                      <option key={a} value={a} className="text-night-900">
                        {labels.allergyLabel(a)}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-night-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              <TextField label={t('otherAllergies')} optional placeholder={t('otherAllergiesPlaceholder')} value={form.autresAllergies} onChange={(e) => set('autresAllergies', e.target.value)} />
              <TextField label={t('sectionMedical')} optional placeholder={t('medicalInfoPlaceholder')} value={form.infosMedicales} onChange={(e) => set('infosMedicales', e.target.value)} />
              <SelectField label={t('bloodGroup')} optional placeholder={t('select')} options={labels.options(BLOOD_GROUPS, labels.bloodLabel)} value={form.groupeSanguin} onChange={(e) => set('groupeSanguin', e.target.value)} />
              <TextField label={t('treatment')} optional placeholder={t('treatmentPlaceholder')} value={form.traitement} onChange={(e) => set('traitement', e.target.value)} />
              <TextField label={t('doctor')} optional placeholder={t('doctorPlaceholder')} value={form.medecinTraitant} onChange={(e) => set('medecinTraitant', e.target.value)} />
            </fieldset>

            {saveError && (
              <p role="alert" className="mt-6 text-center text-sm font-semibold text-alert-600">
                {saveError}
              </p>
            )}
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button type="button" className={btn.secondary} onClick={() => {
                  setStepChanged(true)
                  setStep(1)
                }}>
                {t('previous')}
              </button>
              <button type="submit" className={btn.primary} disabled={saving} aria-busy={saving}>
                {saving ? t('saving') : t('save')}
              </button>
            </div>

            {child.mine !== false && <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mx-auto mt-6 flex min-h-[44px] items-center text-xs font-semibold text-alert-600 underline-offset-4 hover:underline"
            >
              {t('deleteProfile')}
            </button>}
          </>
        )}
      </form>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => router.push(`/app/enfants/${id}`)}
        title={t('discardTitle')}
        description={t('discardText')}
        confirmLabel={t('discard')}
        cancelLabel={t('continue')}
        tone="default"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          // Supabase : suppression logique (deleted_at, RLS). Démo : sans effet.
          try {
            await removeChild(id)
            router.push('/app/enfants')
          } catch (err) {
            setConfirmDelete(false)
            setSaveError(err instanceof Error ? err.message : t('deleteFailed'))
          }
        }}
        title={t('deleteTitle', { name: child.prenom })}
        description={t('deleteText')}
        confirmLabel={t('delete')}
        tone="danger"
      />
    </div>
  )
}

function SectionTitle({ id, icon, children, className }: { id?: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} tabIndex={id ? -1 : undefined} className={cn('flex items-center gap-2.5 text-[15px] font-extrabold text-night-900 outline-none', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-night-50 text-night-700" aria-hidden="true">
        {icon}
      </span>
      {children}
    </h2>
  )
}
