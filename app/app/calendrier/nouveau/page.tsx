'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Globe, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, SuccessState } from '@/components/mobile/StateScreens'
import { Switch } from '@/components/ui'
import {
  ChildrenPicker, DateTimeFields, FieldLabel, SubmitBar, TextAreaField, TextField, TypeTileGroup,
} from '@/components/journal/FormFields'
import { EVENT_ICONS, typeStyle } from '@/components/calendrier/eventTypeStyles'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { RecurrenceFields, selectCls } from '@/components/calendrier/RecurrenceFields'
import { EVENT_TYPES, REMINDER_OPTIONS, SHARED_BY_DEFAULT, dayOf, parseOccurrenceId, type EventTypeKey, type ReminderKey } from '@/lib/calendrier'
import { cn } from '@/lib/cn'
import { DEFAULT_RECURRENCE, buildRule, stateFromRule, type RecurrenceState } from '@/lib/recurrence-form'
import { TIMEZONE_CHOICES } from '@/lib/timezones'
import { DEFAULT_TZ, addDaysToKey, currentTz, dayKeyInTz, timeInTz, todayKey, wallTimeToIso } from '@/lib/tz'
import { useChildOptions } from '@/lib/data/children'
import { createEvent, updateEvent, useEvent, type SeriesScope } from '@/lib/data/calendar'
import { useSharedChildIds } from '@/lib/data/family'
import { parseCalendarPrefill, type RawParams } from '@/lib/prefill'

// M06 — Ajouter un événement au calendrier.
// Supabase : insert/update calendar_events via lib/data/calendar. `?id=` = modification.
// Récurrence (0660) : bloc « Répétition » (lib/recurrence-form) ; heure murale dans le fuseau de l'événement.
//   Modification d'une occurrence : `?id=<idSérie~ms>&scope=one|following|all` (choix fait sur la fiche).
// Pré-remplissage (contrat d'URL, lib/prefill) : type, titre, date, heure, enfant, rappel=1, source=guide:<slug>.
// Rendez-vous `sante` : enfant obligatoire s'il y en a plusieurs, présélectionné s'il n'y en a qu'un.

/** Rappel proposé quand l'URL demande `rappel=1`. */
const PREFILL_REMINDER: ReminderKey = 'eve20'
const ID_RE = /^[A-Za-z0-9_-]{1,64}(~\d{1,16})?$/
const SCOPES: SeriesScope[] = ['one', 'following', 'all']

/** Fin = début + `minutes`, en heure murale du fuseau `tz`. */
function shiftEnd(day: string, time: string, minutes: number, tz: string): { day: string; time: string } {
  const end = new Date(Date.parse(wallTimeToIso(day, time || '09:00', tz)) + minutes * 60_000)
  return { day: dayKeyInTz(end, tz), time: timeInTz(end, tz) }
}

function minutesBetween(d1: string, t1: string, d2: string, t2: string, tz: string): number {
  if (!d1 || !d2) return 60
  return Math.round((Date.parse(wallTimeToIso(d2, t2 || '09:00', tz)) - Date.parse(wallTimeToIso(d1, t1 || '09:00', tz))) / 60_000)
}

export default function NouvelEvenementPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = use(searchParams)
  const t = useTranslations('calendar')
  const tTz = useTranslations('shared.timezones')
  const f = useCalFormat()
  const editId = typeof params.id === 'string' && ID_RE.test(params.id) ? params.id : undefined
  const occ = editId ? parseOccurrenceId(editId) : null
  const scope: SeriesScope = occ ? (SCOPES.find((s) => s === params.scope) ?? 'one') : 'all'
  // « Toute la série » depuis une occurrence : on modifie la série telle qu'enregistrée (1re date, règle).
  const loadId = occ && scope === 'all' ? occ.seriesId : editId
  // En modification, l'URL de pré-remplissage est ignorée : l'événement existant fait foi.
  const prefill = useMemo(() => (editId ? {} : parseCalendarPrefill(params)), [editId, params])
  const router = useRouter()
  const { options: rawChildOptions, loading: childrenLoading } = useChildOptions()
  // Libellé « Prénom (n ans) » traduit au rendu (lib/data/children est partagé).
  const childOptions = useMemo(
    () => rawChildOptions.map((c) => ({ ...c, label: t('common.childOption', { name: c.prenom, count: c.age }) })),
    [rawChildOptions, t],
  )
  const { data: existing } = useEvent(loadId ?? null)
  const prefilled = useRef(false)
  const childPrefilled = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [type, setType] = useState<EventTypeKey>(prefill.type ?? 'visite')
  const [date, setDate] = useState(prefill.date ?? '')
  const [time, setTime] = useState(prefill.heure ?? '')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState(prefill.titre ?? '')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [reminder, setReminder] = useState<ReminderKey>(prefill.rappel ? PREFILL_REMINDER : 'none')
  const [childIds, setChildIds] = useState<string[]>([])
  const [repeat, setRepeat] = useState<RecurrenceState>(DEFAULT_RECURRENCE)
  // Fuseau de l'événement : celui de l'utilisateur, connu seulement dans le navigateur (posé après montage).
  const [tz, setTz] = useState(DEFAULT_TZ)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Famille (docs/FAMILLE.md) : partagé par défaut si l'événement concerne un enfant partagé ET que son type
  // relève de ce que l'autre parent doit savoir (SHARED_BY_DEFAULT) ;
  // `null` = pas encore touché par l'utilisateur (la valeur suit alors les enfants choisis).
  const sharedChildIds = useSharedChildIds()
  const [familyChoice, setFamilyChoice] = useState<boolean | null>(null)

  const editing = Boolean(editId && existing)
  const onlyOne = Boolean(occ && scope === 'one')
  const isHealth = type === 'sante'
  const singleChild = childOptions.length === 1 ? childOptions[0] : undefined
  // Enfant passé dans l'URL : retenu seulement s'il fait partie des enfants du compte.
  const urlChild = prefill.enfant ? childOptions.find((c) => c.id === prefill.enfant) : undefined

  // Valeurs par défaut calculées côté client, dans le fuseau de l'utilisateur (pas le fuseau implicite du navigateur) :
  // l'heure pleine suivante ; la nuit (avant 7 h) 09:00 le jour même ; après 23 h, le lendemain à 09:00. Fin : + 1 h.
  useEffect(() => {
    if (editId) return
    setTz(currentTz())
    const now = new Date()
    const h = Number(timeInTz(now).slice(0, 2))
    const late = h >= 23
    const night = h < 7
    const d = prefill.date ?? (late ? addDaysToKey(todayKey(), 1) : todayKey())
    const tm = prefill.heure ?? (late || night ? '09:00' : `${String(h + 1).padStart(2, '0')}:00`)
    setDate((v) => v || d)
    setTime((v) => v || tm)
    const end = shiftEnd(d, tm, 60, currentTz())
    setEndDate((v) => v || end.day)
    setEndTime((v) => v || end.time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Modification : pré-remplissage unique dès que l'événement est chargé (heures dans le fuseau de la série).
  useEffect(() => {
    if (!existing || prefilled.current) return
    prefilled.current = true
    childPrefilled.current = true
    const evTz = existing.recurrence?.tz ?? currentTz()
    setTz(evTz)
    setType(existing.type)
    setDate(dayKeyInTz(existing.start, evTz))
    setTime(timeInTz(existing.start, evTz))
    setEndDate(dayKeyInTz(existing.end, evTz))
    setEndTime(timeInTz(existing.end, evTz))
    setTitle(existing.title)
    setLocation(existing.location ?? '')
    setDescription(existing.description ?? '')
    setChildIds(existing.childrenIds ?? [])
    setReminder(existing.reminder ?? 'none')
    setFamilyChoice(existing.familyShared ?? null)
    if (existing.recurrence) setRepeat(stateFromRule(existing.recurrence.rule, evTz, { dropCount: scope === 'following' }))
  }, [existing, scope])

  // Création : enfant de l'URL, sinon l'enfant unique pour un rendez-vous santé (une seule fois).
  useEffect(() => {
    if (editId || childPrefilled.current || childrenLoading || childOptions.length === 0) return
    childPrefilled.current = true
    if (urlChild) setChildIds([urlChild.id])
    else if (isHealth && singleChild) setChildIds([singleChild.id])
  }, [editId, childrenLoading, childOptions.length, urlChild, isHealth, singleChild])

  function onType(v: string) {
    const next = v as EventTypeKey
    setType(next)
    // Passage en « Santé » avec un seul enfant : on le rattache d'office.
    if (next === 'sante' && singleChild && childIds.length === 0) setChildIds([singleChild.id])
  }

  // Début déplacé : la fin suit, durée conservée.
  function onStart(nextDate: string, nextTime: string) {
    const duration = Math.max(0, minutesBetween(date, time, endDate, endTime, tz))
    setDate(nextDate)
    setTime(nextTime)
    if (nextDate) {
      const end = shiftEnd(nextDate, nextTime, duration, tz)
      setEndDate(end.day)
      setEndTime(end.time)
    }
  }

  const sharedSelected = childOptions.filter((c) => childIds.includes(c.id) && (sharedChildIds ?? []).includes(c.id))
  const hasFamily = (sharedChildIds?.length ?? 0) > 0
  const familyShared = familyChoice ?? (sharedSelected.length > 0 && SHARED_BY_DEFAULT.has(type))
  const familyHelp = !familyShared
    ? t('new.familyHidden')
    : sharedSelected.length > 0
      ? t(type === 'sante' ? 'new.familySharedHealth' : 'new.familyShared', { names: sharedSelected.map((c) => c.prenom).join(', ') })
      : t('new.familyPickChild')

  const span = minutesBetween(date, time, endDate, endTime, tz)
  const titleError = submitted && !title.trim() ? t('new.titleRequired') : undefined
  const dateError = submitted && !date ? t('new.dateRequired') : undefined
  const endError = submitted && (!endDate || span < 0 || span > 14 * 1440) ? t('new.endError') : undefined
  const childMissing = isHealth && childOptions.length > 1 && childIds.length === 0
  const childError = submitted && childMissing ? t('new.childRequired') : undefined
  const tzChoice = TIMEZONE_CHOICES.find((c) => c.value === tz)
  const tzLabel = tzChoice ? `${tTz(`zones.${tzChoice.key}`)} (${tz})` : tz

  const tiles = EVENT_TYPES.map((et) => {
    const s = typeStyle(et.key)
    const Icon = EVENT_ICONS[et.icon]
    return {
      value: et.key,
      label: f.typeLabel(et.key),
      icon: <Icon className={cn('h-[22px] w-[22px]', s.icon)} strokeWidth={1.8} />,
      idleClass: cn(s.bg, s.border),
      selectedClass: cn(s.bg, 'border-transparent ring-2', s.ring),
    }
  })

  // Retour depuis l'espace Santé d'un enfant (« Ajouter un rendez-vous santé »).
  const healthReturn = !editId && prefill.type === 'sante' && urlChild ? `/app/enfants/${urlChild.id}/sante` : undefined
  const backHref = editId ? `/app/calendrier/${editId}` : (prefill.source?.href ?? healthReturn ?? '/app/calendrier')
  const scopeNotice = occ
    ? t(scope === 'one' ? 'new.scopeOne' : scope === 'following' ? 'new.scopeFollowing' : 'new.scopeAll', { date: f.dateMedium(dayOf(occ.occurrence)) })
    : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!title.trim()) { document.getElementById('ev-title')?.focus(); return }
    if (!date) return
    if (!endDate || span < 0 || span > 14 * 1440) return
    if (childMissing) { pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); return }
    setSaving(true)
    setSaveError(null)
    const input = {
      type, title, date, time, endDate, endTime, location, description, childIds, reminder, tz,
      recurrence: onlyOne ? undefined : buildRule(repeat, date, tz),
      ...(hasFamily || familyChoice !== null ? { familyShared } : {}),
    }
    try {
      if (editId && existing) await updateEvent(occ && scope === 'all' ? occ.seriesId : editId, input, scope)
      else await createEvent(input)
      if (!editing && prefill.source) { setSaved(true); setSaving(false); return }
      const healthChild = type === 'sante' && childIds.length === 1 ? childIds[0] : undefined
      const recurring = Boolean(existing?.recurrence) || Boolean(input.recurrence)
      router.push(
        editing
          ? (onlyOne ? `/app/calendrier/${editId}` : recurring ? '/app/calendrier' : `/app/calendrier/${editId}`)
          : (healthReturn && healthChild ? `/app/enfants/${healthChild}/sante` : '/app/calendrier'),
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.saveFailed'))
      setSaving(false)
    }
  }

  if (saved && prefill.source) {
    return (
      <>
        <TopBar title={t('new.savedTitle')} showBack backHref={prefill.source.href} showBell={false} />
        <SuccessState
          compact
          title={t('new.savedHeading')}
          description={t('new.savedDesc', { title: title.trim() })}
          primary={{ label: t('new.backToGuide'), href: prefill.source.href }}
          secondary={{ label: t('new.viewCalendar'), href: '/app/calendrier' }}
        />
      </>
    )
  }

  // Événement partagé par un autre parent : lecture seule (seul l'auteur le modifie).
  if (existing?.sharedBy) {
    return (
      <>
        <TopBar title={t('new.titleEdit')} showBack backHref={`/app/calendrier/${existing.id}`} showBell={false} />
        <EmptyState
          title={t('new.authorOnlyTitle')}
          description={t('new.authorOnlyDesc', { prenom: existing.sharedBy.prenom })}
          primary={{ label: t('new.viewEvent'), href: `/app/calendrier/${existing.id}` }}
        />
      </>
    )
  }

  return (
    <>
      <TopBar title={editing ? t('new.titleEdit') : t('new.titleAdd')} showBack backHref={backHref} showBell={false} />

      <form onSubmit={onSubmit} noValidate className="space-y-5 px-4 pb-6 pt-3">
        {prefill.source && (
          <p className="flex items-start gap-2 rounded-xl bg-leaf-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-leaf-800">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            {t('new.prefillNotice')}
          </p>
        )}
        {scopeNotice && (
          <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-sky-900">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            {scopeNotice}
          </p>
        )}

        {!onlyOne && <TypeTileGroup name="type" options={tiles} value={type} onChange={onType} />}

        <div className="space-y-3">
          <DateTimeFields legend={t('new.startLabel')} date={date} time={time} onDate={(d) => onStart(d, time)} onTime={(tm) => onStart(date, tm)} dateError={dateError} />
          <DateTimeFields legend={t('new.endLabel')} date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} dateError={endError} />
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-night-600">
            <Globe aria-hidden="true" className="h-3.5 w-3.5" />
            {t('new.tzLine', { tz: tzLabel })}
            {!existing && (
              <Link href="/app/profil/preferences/general" className="font-semibold text-leaf-700 underline underline-offset-2">{t('new.tzChange')}</Link>
            )}
          </p>
        </div>

        {!onlyOne && (
          <RecurrenceFields value={repeat} onChange={setRepeat} startDay={date} startTime={time} endDay={endDate} endTime={endTime} tz={tz} />
        )}

        <TextField
          id="ev-title"
          label={t('new.titleLabel')}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isHealth ? t('new.titlePlaceholderHealth') : t('new.titlePlaceholder')}
          maxLength={120}
          error={titleError}
        />

        <TextField
          label={t('new.locationLabel')}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={isHealth ? t('new.locationPlaceholderHealth') : t('new.locationPlaceholder')}
          maxLength={200}
        />

        <TextAreaField
          label={t('new.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('new.descriptionPlaceholder')}
          maxLength={500}
        />

        {!onlyOne && (
          <div ref={pickerRef}>
            <ChildrenPicker
              label={isHealth ? (childOptions.length > 1 ? t('new.childRequiredLabel') : t('new.childLabel')) : t('new.childrenLabel')}
              options={childOptions}
              value={childIds}
              onChange={setChildIds}
            />
            {isHealth && !childError && (
              <p className="mt-1.5 text-xs text-night-600">{t('new.healthHint')}</p>
            )}
            {childError && <p role="alert" className="mt-1.5 text-xs font-medium text-alert-600">{childError}</p>}
          </div>
        )}

        {!onlyOne && (
          <div>
            <FieldLabel htmlFor="ev-reminder">{t('new.reminderLabel')}</FieldLabel>
            <div className="relative">
              <select id="ev-reminder" value={reminder} onChange={(e) => setReminder(e.target.value as ReminderKey)} className={selectCls}>
                {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{f.reminderLabel(o.value)}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
            </div>
          </div>
        )}

        {hasFamily && !onlyOne && (
          <div className="rounded-xl border border-night-100 bg-white px-4">
            <Switch
              label={t('new.familyLabel')}
              description={familyHelp}
              checked={familyShared}
              onChange={(e) => setFamilyChoice(e.target.checked)}
            />
          </div>
        )}

        {saveError && (
          <p role="alert" className="text-center text-[13px] font-semibold text-alert-600">{saveError}</p>
        )}

        <div className="pt-1">
          <SubmitBar disabled={saving}>{saving ? t('common.saving') : t('new.save')}</SubmitBar>
        </div>
      </form>
    </>
  )
}
