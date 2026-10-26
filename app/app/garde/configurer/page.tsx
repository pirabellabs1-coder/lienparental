'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Input, RadioGroup, Select, StepIndicator, Switch } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { CustomPatternPicker } from '@/components/garde/CustomPatternPicker'
import { setGardeFlash } from '@/components/garde/store'
import { useGardeNames } from '@/components/garde/useGardeNames'
import { fetchGardeConfig, storeGardeConfig } from '@/lib/data/garde'
import {
  RYTHME_LABELS, WEEKDAY_LABELS, ZONE_OPTIONS, capitalize, zoneCalendarNote,
  type GardeConfig, type GardeNames, type LieuEchange, type Parent, type Rythme, type ZoneScolaire,
} from '@/lib/garde'

const STEPS = ['Rythme', 'Échanges', 'Vacances scolaires']

const btnPrimary =
  'inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white transition hover:bg-leaf-600 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'
const btnSecondary =
  'inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-night-200 bg-white px-5 text-[14px] font-semibold text-night-900 transition hover:bg-night-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400'

const RYTHME_OPTIONS: { value: Rythme; description: string }[] = [
  { value: 'alternee', description: 'Les enfants changent de foyer chaque semaine, le même jour.' },
  { value: '2-2-3', description: 'Blocs de 2, 2 puis 3 jours : aucun parent ne reste plus de 5 jours sans les enfants.' },
  { value: 'weekends', description: 'Un parent accueille un week-end sur deux et chaque mercredi.' },
  { value: 'personnalise', description: 'Vous choisissez jour par jour sur un cycle de deux semaines.' },
]

function lieuOptions(names: GardeNames): { value: LieuEchange; label: string }[] {
  return [
    { value: 'ecole', label: 'École' },
    { value: 'domicile-moi', label: 'Votre domicile' },
    { value: 'domicile-autre', label: `Domicile de ${names.coParent}` },
    { value: 'autre', label: 'Autre lieu' },
  ]
}

function parentOptions(names: GardeNames) {
  return [
    { value: 'moi', label: 'Vous' },
    { value: 'autre', label: names.coParentKnown ? `${names.coParent} (l'autre parent)` : capitalize(names.coParent) },
  ]
}

// Assistant de configuration du planning de garde (3 étapes).
// Supabase : upsert garde_configs (RLS user_id) via lib/data/garde. Notification à l'autre parent : à venir.
export default function ConfigurerGardePage() {
  const router = useRouter()
  const today = useClientNow()
  const names = useGardeNames()
  const [config, setConfig] = useState<GardeConfig | null>(null)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!today) return
    let alive = true
    fetchGardeConfig(today)
      .then((c) => alive && setConfig(c))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Chargement impossible.'))
    return () => { alive = false }
  }, [today])

  // Focus sur le titre de l'étape à chaque changement (pas au premier affichage).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  if (!config) {
    return (
      <>
        <TopBar title="Configurer la garde" showBack backHref="/app/garde" showBell={false} />
        {loadError ? <p role="alert" className="px-5 pt-6 text-center text-sm font-semibold text-alert-600">{loadError}</p> : <LoadingState compact title="Chargement" description="" />}
      </>
    )
  }

  const c = config
  const update = (patch: Partial<GardeConfig>) => setConfig({ ...c, ...patch })
  const updateVac = (patch: Partial<GardeConfig['vacances']>) => setConfig({ ...c, vacances: { ...c.vacances, ...patch } })

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {}
    if (s === 1 && c.rythme === 'personnalise') {
      const mine = c.customPattern.filter(Boolean).length
      if (mine === 0 || mine === 14) e.pattern = 'Attribuez au moins un jour à chaque parent.'
    }
    if (s === 2) {
      if (!c.startDate) e.startDate = 'Indiquez une date de début.'
      if (!/^\d{2}:\d{2}$/.test(c.handoverTime)) e.handoverTime = "Indiquez l'heure de l'échange."
      if (c.lieu === 'autre' && !c.lieuAutre?.trim()) e.lieuAutre = 'Précisez le lieu de l’échange.'
    }
    return e
  }

  async function next(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(step)
    setErrors(e)
    if (Object.keys(e).length > 0) return
    if (step < STEPS.length) {
      setStep(step + 1)
      return
    }
    if (saving) return
    setSaving(true)
    try {
      await storeGardeConfig({ ...c, lieuAutre: c.lieu === 'autre' ? c.lieuAutre?.trim() : undefined })
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : 'Enregistrement impossible.' })
      setSaving(false)
      return
    }
    setGardeFlash('Planning de garde enregistré.')
    router.push('/app/garde')
  }

  const startHint =
    c.rythme === 'alternee'
      ? `Le premier échange aura lieu le premier ${WEEKDAY_LABELS[c.handoverWeekday]} à partir de cette date.`
      : c.rythme === 'weekends'
        ? 'Le premier week-end est celui du premier vendredi à partir de cette date.'
        : 'Le cycle démarre le premier lundi à partir de cette date.'

  const firstParentLabel =
    c.rythme === 'alternee'
      ? 'Qui a les enfants la première semaine ?'
      : c.rythme === '2-2-3'
        ? 'Qui a les enfants les deux premiers jours ?'
        : 'Qui accueille les week-ends et les mercredis ?'

  return (
    <>
      <TopBar title="Configurer la garde" showBack backHref="/app/garde" showBell={false} />

      <form onSubmit={next} noValidate className="w-full px-5 pb-8 pt-2">
        <StepIndicator current={step} total={STEPS.length} labels={STEPS} variant="numbered" />
        <ol className="mt-2 grid grid-cols-3 text-[11px] font-semibold text-night-500" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s} className={i + 1 === step ? 'text-night-900' : undefined}>{s}</li>
          ))}
        </ol>

        <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-[18px] font-extrabold text-night-900 focus:outline-none">
          <span className="sr-only">Étape {step} sur {STEPS.length} : </span>
          {step === 1 && 'Quel rythme suivez-vous ?'}
          {step === 2 && 'Comment se passent les échanges ?'}
          {step === 3 && 'Et pendant les vacances scolaires ?'}
        </h2>

        <div className="mt-4 space-y-5">
          {step === 1 && (
            <>
              <RadioGroup
                name="rythme"
                label="Rythme de garde"
                value={c.rythme}
                onChange={(v) => update({ rythme: v as Rythme })}
                options={RYTHME_OPTIONS.map((o) => ({ value: o.value, label: RYTHME_LABELS[o.value], description: o.description }))}
                className="[&>div:first-child]:sr-only lg:[&>div:last-of-type]:grid-cols-2"
              />
              {c.rythme === 'personnalise' && (
                <CustomPatternPicker
                  value={c.customPattern}
                  onChange={(p) => update({ customPattern: p })}
                  error={errors.pattern}
                  errorId="pattern-error"
                  names={names}
                />
              )}
              {c.rythme === 'weekends' && (
                <Switch
                  label="Un week-end sur deux"
                  description="Désactivez si le parent accueille tous les week-ends."
                  checked={c.weekendsAlternes}
                  onChange={(e) => update({ weekendsAlternes: e.target.checked })}
                />
              )}
            </>
          )}

          {step === 2 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Input
                type="date"
                label="Date de début"
                required
                value={c.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                hint={startHint}
                error={errors.startDate}
                containerClassName="lg:col-span-2"
              />
              {c.rythme !== 'personnalise' && (
                <RadioGroup
                  name="firstParent"
                  label={firstParentLabel}
                  value={c.firstParent}
                  onChange={(v) => update({ firstParent: v as Parent })}
                  options={parentOptions(names)}
                  columns={2}
                  className="lg:col-span-2"
                />
              )}
              {c.rythme === 'alternee' ? (
                <Select
                  label="Jour d'échange"
                  value={String(c.handoverWeekday)}
                  onChange={(e) => update({ handoverWeekday: Number(e.target.value) })}
                  options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({
                    value: String(d),
                    label: WEEKDAY_LABELS[d].charAt(0).toUpperCase() + WEEKDAY_LABELS[d].slice(1),
                  }))}
                />
              ) : (
                <div className="rounded-xl bg-night-50/70 p-3 text-xs leading-relaxed text-night-700">
                  {c.rythme === '2-2-3' && 'Les échanges ont lieu le lundi, le mercredi et le vendredi.'}
                  {c.rythme === 'weekends' && 'Week-end du vendredi au dimanche à l’heure choisie ; mercredi de 9h à 18h.'}
                  {c.rythme === 'personnalise' && 'Un échange a lieu chaque jour où les enfants changent de foyer.'}
                </div>
              )}
              <Input
                type="time"
                label="Heure d'échange"
                required
                value={c.handoverTime}
                onChange={(e) => update({ handoverTime: e.target.value })}
                error={errors.handoverTime}
              />
              <Select
                label="Lieu d'échange"
                value={c.lieu}
                onChange={(e) => update({ lieu: e.target.value as LieuEchange })}
                options={lieuOptions(names)}
                containerClassName={c.lieu === 'autre' ? undefined : 'lg:col-span-2'}
              />
              {c.lieu === 'autre' && (
                <Input
                  label="Précisez le lieu"
                  required
                  maxLength={80}
                  placeholder="Ex. : médiathèque, gare…"
                  value={c.lieuAutre ?? ''}
                  onChange={(e) => update({ lieuAutre: e.target.value })}
                  error={errors.lieuAutre}
                />
              )}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="rounded-2xl border border-night-100 bg-white px-4 shadow-[0_1px_2px_rgba(11,45,91,0.05),0_12px_30px_-18px_rgba(11,45,91,0.2)]">
                <Switch
                  label="Moitié des vacances, alternance par année paire/impaire"
                  description="Chaque parent a la moitié des vacances ; l’ordre s’inverse chaque année."
                  checked={c.vacances.moitie}
                  onChange={(e) => updateVac({ moitie: e.target.checked })}
                />
              </div>
              <Select
                label="Calendrier scolaire"
                value={c.vacances.zone}
                onChange={(e) => updateVac({ zone: e.target.value as ZoneScolaire })}
                options={ZONE_OPTIONS}
                hint={zoneCalendarNote(c.vacances.zone)}
              />
              {c.vacances.moitie && (
                <RadioGroup
                  name="premiereMoitie"
                  label="Les années paires, la première moitié revient à"
                  value={c.vacances.premiereMoitieAnneesPaires}
                  onChange={(v) => updateVac({ premiereMoitieAnneesPaires: v as Parent })}
                  options={parentOptions(names)}
                  columns={2}
                  hint="Les années impaires, l’ordre est inversé."
                />
              )}
            </>
          )}
        </div>

        {errors.save && (
          <p role="alert" className="mt-6 text-center text-[13px] font-semibold text-alert-600">{errors.save}</p>
        )}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button type="button" onClick={() => { setErrors({}); setStep(step - 1) }} className={btnSecondary}>
              Retour
            </button>
          )}
          <button type="submit" className={btnPrimary} disabled={saving} aria-busy={saving}>
            {step < STEPS.length ? 'Continuer' : saving ? 'Enregistrement…' : 'Enregistrer le planning'}
          </button>
        </div>
      </form>
    </>
  )
}
