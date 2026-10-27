'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Input, RadioGroup, Select, StepIndicator, Switch } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { LoadingState } from '@/components/mobile/StateScreens'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { CustomPatternPicker } from '@/components/garde/CustomPatternPicker'
import { setGardeFlash } from '@/components/garde/store'
import { useGardeNames } from '@/components/garde/useGardeNames'
import { weekdayNames } from '@/components/calendrier/useCalFormat'
import { intlLocale } from '@/lib/i18n/config'
import { fetchGardeConfig, storeGardeConfig } from '@/lib/data/garde'
import {
  SCHOOL_HOLIDAYS, ZONE_CALENDAR_UNTIL, ZONE_OPTIONS,
  type GardeConfig, type GardeNames, type LieuEchange, type Parent, type Rythme, type ZoneScolaire,
} from '@/lib/garde'

// Libellés : calendar.custodySetup.steps.*
const STEPS = ['rythme', 'echanges', 'vacances'] as const

const btnPrimary =
  'inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-leaf-500 px-5 text-[14px] font-semibold text-white transition hover:bg-leaf-600 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 focus-visible:ring-offset-2'
const btnSecondary =
  'inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-night-200 bg-white px-5 text-[14px] font-semibold text-night-900 transition hover:bg-night-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400'

// Libellés : calendar.custody.rythmes.* et descriptions calendar.custodySetup.rythmeDesc.*
const RYTHMES: Rythme[] = ['alternee', '2-2-3', 'weekends', 'personnalise']

// Libellés : calendar.custodySetup.lieuOptions.*
const LIEUX: LieuEchange[] = ['ecole', 'domicile-moi', 'domicile-autre', 'autre']

// Traducteur de l'espace « calendar » (useTranslations('calendar')).
type Translate = (key: string, values?: Record<string, string | number>) => string

function lieuOptions(t: Translate, names: GardeNames): { value: LieuEchange; label: string }[] {
  const who = { coParent: names.coParent, known: names.coParentKnown ? 'yes' : 'no' }
  return LIEUX.map((value) => ({ value, label: t(`custodySetup.lieuOptions.${value}`, who) }))
}

function parentOptions(t: Translate, names: GardeNames) {
  return [
    { value: 'moi', label: t('custodySetup.parentMe') },
    {
      value: 'autre',
      label: names.coParentKnown ? t('custodySetup.parentOtherKnown', { coParent: names.coParent }) : t('custodySetup.parentOtherNeutral'),
    },
  ]
}

/** Aide sous le choix de zone : période couverte par les dates officielles (cf. lib/garde → zoneCalendarNote). */
function zoneNote(t: Translate, locale: string, zone: ZoneScolaire): string {
  const [y, m, d] = ZONE_CALENDAR_UNTIL[zone].split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const summer = SCHOOL_HOLIDAYS.some((h) => h.zones.includes(zone) && h.start.startsWith('2027-07'))
  return summer ? t('custodySetup.zoneNoteFull', { date }) : t('custodySetup.zoneNotePartial', { date })
}

// Assistant de configuration du planning de garde (3 étapes).
// Supabase : upsert garde_configs (RLS user_id) via lib/data/garde. Notification à l'autre parent : à venir.
export default function ConfigurerGardePage() {
  const router = useRouter()
  const t = useTranslations('calendar')
  const locale = useLocale()
  const weekdays = weekdayNames(locale)
  /** 0 = dimanche … 6 = samedi (lib/garde) → nom du jour dans la langue active. */
  const weekdayLong = (d: number) => weekdays[(d + 6) % 7].long
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
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : t('custodySetup.loadFailed')))
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
        <TopBar title={t('custodySetup.title')} showBack backHref="/app/garde" showBell={false} />
        {loadError ? <p role="alert" className="px-5 pt-6 text-center text-sm font-semibold text-alert-600">{loadError}</p> : <LoadingState compact title={t('custodySetup.loading')} description="" />}
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
      if (mine === 0 || mine === 14) e.pattern = t('custodySetup.errPattern')
    }
    if (s === 2) {
      if (!c.startDate) e.startDate = t('custodySetup.errStartDate')
      if (!/^\d{2}:\d{2}$/.test(c.handoverTime)) e.handoverTime = t('custodySetup.errTime')
      if (c.lieu === 'autre' && !c.lieuAutre?.trim()) e.lieuAutre = t('custodySetup.errLieu')
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
      setErrors({ save: err instanceof Error ? err.message : t('common.saveFailed') })
      setSaving(false)
      return
    }
    setGardeFlash(t('custodySetup.saved'))
    router.push('/app/garde')
  }

  const startHint =
    c.rythme === 'alternee'
      ? t('custodySetup.startHintAlternee', { weekday: weekdayLong(c.handoverWeekday) })
      : c.rythme === 'weekends'
        ? t('custodySetup.startHintWeekends')
        : t('custodySetup.startHintCycle')

  const firstParentLabel =
    c.rythme === 'alternee'
      ? t('custodySetup.firstParentAlternee')
      : c.rythme === '2-2-3'
        ? t('custodySetup.firstParent223')
        : t('custodySetup.firstParentWeekends')

  return (
    <>
      <TopBar title={t('custodySetup.title')} showBack backHref="/app/garde" showBell={false} />

      <form onSubmit={next} noValidate className="w-full px-5 pb-8 pt-2">
        <StepIndicator current={step} total={STEPS.length} labels={STEPS.map((s) => t(`custodySetup.steps.${s}`))} variant="numbered" />
        <ol className="mt-2 grid grid-cols-3 text-[11px] font-semibold text-night-500" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s} className={i + 1 === step ? 'text-night-900' : undefined}>{t(`custodySetup.steps.${s}`)}</li>
          ))}
        </ol>

        <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-[18px] font-extrabold text-night-900 focus:outline-none">
          <span className="sr-only">{t('custodySetup.stepOf', { step, total: STEPS.length })}</span>
          {step === 1 && t('custodySetup.heading1')}
          {step === 2 && t('custodySetup.heading2')}
          {step === 3 && t('custodySetup.heading3')}
        </h2>

        <div className="mt-4 space-y-5">
          {step === 1 && (
            <>
              <RadioGroup
                name="rythme"
                label={t('custodySetup.rythmeLabel')}
                value={c.rythme}
                onChange={(v) => update({ rythme: v as Rythme })}
                options={RYTHMES.map((value) => ({ value, label: t(`custody.rythmes.${value}`), description: t(`custodySetup.rythmeDesc.${value}`) }))}
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
                  label={t('custodySetup.weekendsAlt')}
                  description={t('custodySetup.weekendsAltDesc')}
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
                label={t('custodySetup.startDate')}
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
                  options={parentOptions(t, names)}
                  columns={2}
                  className="lg:col-span-2"
                />
              )}
              {c.rythme === 'alternee' ? (
                <Select
                  label={t('custodySetup.handoverDay')}
                  value={String(c.handoverWeekday)}
                  onChange={(e) => update({ handoverWeekday: Number(e.target.value) })}
                  options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({
                    value: String(d),
                    label: weekdayLong(d).charAt(0).toUpperCase() + weekdayLong(d).slice(1),
                  }))}
                />
              ) : (
                <div className="rounded-xl bg-night-50/70 p-3 text-xs leading-relaxed text-night-700">
                  {c.rythme === '2-2-3' && t('custodySetup.info223')}
                  {c.rythme === 'weekends' && t('custodySetup.infoWeekends')}
                  {c.rythme === 'personnalise' && t('custodySetup.infoCustom')}
                </div>
              )}
              <Input
                type="time"
                label={t('custodySetup.handoverTime')}
                required
                value={c.handoverTime}
                onChange={(e) => update({ handoverTime: e.target.value })}
                error={errors.handoverTime}
              />
              <Select
                label={t('custodySetup.handoverPlace')}
                value={c.lieu}
                onChange={(e) => update({ lieu: e.target.value as LieuEchange })}
                options={lieuOptions(t, names)}
                containerClassName={c.lieu === 'autre' ? undefined : 'lg:col-span-2'}
              />
              {c.lieu === 'autre' && (
                <Input
                  label={t('custodySetup.placeOther')}
                  required
                  maxLength={80}
                  placeholder={t('custodySetup.placeOtherPlaceholder')}
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
                  label={t('custodySetup.halfHolidays')}
                  description={t('custodySetup.halfHolidaysDesc')}
                  checked={c.vacances.moitie}
                  onChange={(e) => updateVac({ moitie: e.target.checked })}
                />
              </div>
              <Select
                label={t('custodySetup.schoolCalendar')}
                value={c.vacances.zone}
                onChange={(e) => updateVac({ zone: e.target.value as ZoneScolaire })}
                options={ZONE_OPTIONS.map((z) => ({ value: z.value, label: t(`custodySetup.zones.${z.value}`) }))}
                hint={zoneNote(t, locale, c.vacances.zone)}
              />
              {c.vacances.moitie && (
                <RadioGroup
                  name="premiereMoitie"
                  label={t('custodySetup.firstHalf')}
                  value={c.vacances.premiereMoitieAnneesPaires}
                  onChange={(v) => updateVac({ premiereMoitieAnneesPaires: v as Parent })}
                  options={parentOptions(t, names)}
                  columns={2}
                  hint={t('custodySetup.firstHalfHint')}
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
              {t('custodySetup.back')}
            </button>
          )}
          <button type="submit" className={btnPrimary} disabled={saving} aria-busy={saving}>
            {step < STEPS.length ? t('custodySetup.continue') : saving ? t('common.saving') : t('custodySetup.savePlan')}
          </button>
        </div>
      </form>
    </>
  )
}
