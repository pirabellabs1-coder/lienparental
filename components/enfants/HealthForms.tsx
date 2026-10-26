'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { TextField } from '@/components/journal/FormFields'
import { btn } from '@/components/onboarding/styles'
import { cn } from '@/lib/cn'
import {
  addTreatment, addVaccination, treatmentInput, vaccinationInput,
  type Treatment, type Vaccination,
} from '@/lib/data/health'

// Formulaires d'ajout de l'espace Santé (vaccination, traitement).
// Validation au submit (zod partagé avec la couche de données), erreurs sous chaque champ
// reliées par aria-describedby, focus sur le premier champ invalide.

type Errors = Record<string, string | undefined>

function collect(issues: { path: (string | number)[]; message: string }[]): Errors {
  const out: Errors = {}
  for (const i of issues) {
    const k = String(i.path[0] ?? '_')
    if (!out[k]) out[k] = i.message
  }
  return out
}

function Actions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 pt-1">
      <button type="button" onClick={onCancel} disabled={saving} className={btn.secondary}>Annuler</button>
      <button type="submit" disabled={saving} aria-busy={saving} className={btn.primary}>{saving ? 'Ajout…' : 'Ajouter'}</button>
    </div>
  )
}

export function VaccinationForm({ childId, today, onDone, onCancel }: {
  childId: string; today: string; onDone: (v: Vaccination) => void; onCancel: () => void
}) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [nom, setNom] = useState('')
  const [date, setDate] = useState('')
  const [rappel, setRappel] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = vaccinationInput.safeParse({ nom, date, rappel })
    const errs: Errors = p.success ? {} : collect(p.error.issues)
    if (!errs.date && date > today) errs.date = 'La date de vaccination ne peut pas être dans le futur.'
    setErrors(errs)
    const firstKey = ['nom', 'date', 'rappel'].find((k) => errs[k])
    if (firstKey) { formRef.current?.querySelector<HTMLInputElement>(`[name="${firstKey}"]`)?.focus(); return }
    setSaving(true)
    setFailure('')
    try {
      onDone(await addVaccination(childId, { nom, date, rappel }))
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Ajout impossible.')
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-labelledby={`${id}-t`} className="mt-3 space-y-3.5 rounded-xl bg-night-50/60 p-3.5">
      <p id={`${id}-t`} className="text-[13px] font-extrabold text-night-900">Nouvelle vaccination</p>
      <TextField name="nom" label="Nom du vaccin" required autoComplete="off" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : ROR, fièvre jaune…" error={errors.nom} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <TextField name="date" type="date" label="Date de vaccination" required max={today} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextField name="rappel" type="date" label="Rappel prévu (facultatif)" min={date || undefined} value={rappel} onChange={(e) => setRappel(e.target.value)} error={errors.rappel} />
      </div>
      {failure && <p role="alert" className="text-[12.5px] font-semibold text-alert-600">{failure}</p>}
      <Actions saving={saving} onCancel={onCancel} />
    </form>
  )
}

export function TreatmentForm({ childId, onDone, onCancel }: {
  childId: string; onDone: (t: Treatment) => void; onCancel: () => void
}) {
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [nom, setNom] = useState('')
  const [posologie, setPosologie] = useState('')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = treatmentInput.safeParse({ nom, posologie, debut, fin })
    const errs: Errors = p.success ? {} : collect(p.error.issues)
    setErrors(errs)
    const firstKey = ['nom', 'posologie', 'debut', 'fin'].find((k) => errs[k])
    if (firstKey) { formRef.current?.querySelector<HTMLInputElement>(`[name="${firstKey}"]`)?.focus(); return }
    setSaving(true)
    setFailure('')
    try {
      onDone(await addTreatment(childId, { nom, posologie, debut, fin }))
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Ajout impossible.')
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-labelledby={`${id}-t`} className="mt-3 space-y-3.5 rounded-xl bg-night-50/60 p-3.5">
      <p id={`${id}-t`} className="text-[13px] font-extrabold text-night-900">Nouveau traitement</p>
      <TextField name="nom" label="Nom du traitement" required autoComplete="off" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Amoxicilline" error={errors.nom} />
      <TextField name="posologie" label="Posologie (facultatif)" autoComplete="off" maxLength={160} value={posologie} onChange={(e) => setPosologie(e.target.value)} placeholder="Ex : 2 prises par jour" error={errors.posologie} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <TextField name="debut" type="date" label="Début" required value={debut} onChange={(e) => setDebut(e.target.value)} error={errors.debut} />
        <TextField name="fin" type="date" label="Fin (facultatif)" min={debut || undefined} value={fin} onChange={(e) => setFin(e.target.value)} error={errors.fin} />
      </div>
      {failure && <p role="alert" className="text-[12.5px] font-semibold text-alert-600">{failure}</p>}
      <Actions saving={saving} onCancel={onCancel} />
    </form>
  )
}

/** Petit badge texte (jamais la couleur seule). */
export function HealthBadge({ tone, children }: { tone: 'leaf' | 'orange' | 'alert' | 'night'; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold',
        tone === 'leaf' && 'bg-leaf-50 text-leaf-700',
        tone === 'orange' && 'bg-orange-50 text-orange-700',
        tone === 'alert' && 'bg-alert-50 text-alert-700',
        tone === 'night' && 'bg-night-50 text-night-700',
      )}
    >
      {children}
    </span>
  )
}
