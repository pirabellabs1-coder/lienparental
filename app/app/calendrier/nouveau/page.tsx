'use client'

import { useRouter } from 'next/navigation'
import { use, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, SuccessState } from '@/components/mobile/StateScreens'
import { Switch } from '@/components/ui'
import {
  ChildrenPicker, DateTimeFields, FieldLabel, SubmitBar, TextAreaField, TextField, TypeTileGroup,
} from '@/components/journal/FormFields'
import { EVENT_ICONS, typeStyle } from '@/components/calendrier/eventTypeStyles'
import { EVENT_TYPES, REMINDER_OPTIONS, SHARED_BY_DEFAULT, type EventTypeKey, type ReminderKey } from '@/lib/calendrier'
import { cn } from '@/lib/cn'
import { addDaysToKey, dayKeyInTz, timeInTz, todayKey } from '@/lib/tz'
import { useChildOptions } from '@/lib/data/children'
import { SANTE_CHILD_REQUIRED, createEvent, updateEvent, useEvent } from '@/lib/data/calendar'
import { useSharedChildIds } from '@/lib/data/family'
import { parseCalendarPrefill, type RawParams } from '@/lib/prefill'

// M06 — Ajouter un événement au calendrier.
// Supabase : insert/update calendar_events via lib/data/calendar (fin par défaut = début + 1 h). `?id=` = modification.
// Pré-remplissage (contrat d'URL, lib/prefill) : type, titre, date, heure, enfant, rappel=1, source=guide:<slug>.
// Rendez-vous `sante` : enfant obligatoire s'il y en a plusieurs, présélectionné s'il n'y en a qu'un.

/** Rappel proposé quand l'URL demande `rappel=1`. */
const PREFILL_REMINDER: ReminderKey = 'eve20'

const selectCls =
  'block h-12 w-full appearance-none rounded-xl border border-night-100 bg-white px-4 pr-11 text-[13px] text-night-900 ' +
  'transition-colors focus:outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20'

export default function NouvelEvenementPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = use(searchParams)
  const editId = typeof params.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(params.id) ? params.id : undefined
  // En modification, l'URL de pré-remplissage est ignorée : l'événement existant fait foi.
  const prefill = useMemo(() => (editId ? {} : parseCalendarPrefill(params)), [editId, params])
  const router = useRouter()
  const { options: childOptions, loading: childrenLoading } = useChildOptions()
  const { data: existing } = useEvent(editId ?? null)
  const prefilled = useRef(false)
  const childPrefilled = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [type, setType] = useState<EventTypeKey>(prefill.type ?? 'visite')
  const [date, setDate] = useState(prefill.date ?? '')
  const [time, setTime] = useState(prefill.heure ?? '')
  const [title, setTitle] = useState(prefill.titre ?? '')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [reminder, setReminder] = useState<ReminderKey>(prefill.rappel ? PREFILL_REMINDER : 'none')
  const [childIds, setChildIds] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Famille (docs/FAMILLE.md) : partagé par défaut si l'événement concerne un enfant partagé ET que son type
  // relève de ce que l'autre parent doit savoir (SHARED_BY_DEFAULT) ;
  // `null` = pas encore touché par l'utilisateur (la valeur suit alors les enfants choisis).
  const sharedChildIds = useSharedChildIds()
  const [familyChoice, setFamilyChoice] = useState<boolean | null>(null)

  const editing = Boolean(editId && existing)
  const isHealth = type === 'sante'
  const singleChild = childOptions.length === 1 ? childOptions[0] : undefined
  // Enfant passé dans l'URL : retenu seulement s'il fait partie des enfants du compte.
  const urlChild = prefill.enfant ? childOptions.find((c) => c.id === prefill.enfant) : undefined

  // Valeurs par défaut calculées côté client, dans DEFAULT_TZ (pas le fuseau du navigateur) :
  // l'heure pleine suivante ; après 23 h, le lendemain à 09:00.
  useEffect(() => {
    const now = new Date()
    const h = Number(timeInTz(now).slice(0, 2))
    const late = h >= 23
    setDate((v) => v || (late ? addDaysToKey(todayKey(), 1) : todayKey()))
    setTime((v) => v || (late ? '09:00' : `${String(h + 1).padStart(2, '0')}:00`))
  }, [])

  // Modification : pré-remplissage unique dès que l'événement est chargé.
  useEffect(() => {
    if (!existing || prefilled.current) return
    prefilled.current = true
    childPrefilled.current = true
    setType(existing.type)
    setDate(dayKeyInTz(existing.start))
    setTime(timeInTz(existing.start))
    setTitle(existing.title)
    setLocation(existing.location ?? '')
    setDescription(existing.description ?? '')
    setChildIds(existing.childrenIds ?? [])
    setReminder(existing.reminder ?? 'none')
    setFamilyChoice(existing.familyShared ?? null)
  }, [existing])

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

  const sharedSelected = childOptions.filter((c) => childIds.includes(c.id) && (sharedChildIds ?? []).includes(c.id))
  const hasFamily = (sharedChildIds?.length ?? 0) > 0
  const familyShared = familyChoice ?? (sharedSelected.length > 0 && SHARED_BY_DEFAULT.has(type))
  const familyHelp = !familyShared
    ? 'Masqué : visible par vous seul. L’autre parent n’en est pas informé.'
    : sharedSelected.length > 0
      ? `Ajouté au calendrier de l’autre parent de ${sharedSelected.map((c) => c.prenom).join(', ')}, en lecture seule${type === 'sante' ? '' : ' (et des proches invités)'}.`
      : 'Choisissez un enfant partagé pour que la famille le voie.'

  const titleError = submitted && !title.trim() ? "Donnez un titre à l'événement." : undefined
  const dateError = submitted && !date ? 'La date est requise.' : undefined
  const childMissing = isHealth && childOptions.length > 1 && childIds.length === 0
  const childError = submitted && childMissing ? SANTE_CHILD_REQUIRED : undefined

  const tiles = EVENT_TYPES.map((t) => {
    const s = typeStyle(t.key)
    const Icon = EVENT_ICONS[t.icon]
    return {
      value: t.key,
      label: t.label,
      icon: <Icon className={cn('h-[22px] w-[22px]', s.icon)} strokeWidth={1.8} />,
      idleClass: cn(s.bg, s.border),
      selectedClass: cn(s.bg, 'border-transparent ring-2', s.ring),
    }
  })

  // Retour depuis l'espace Santé d'un enfant (« Ajouter un rendez-vous santé »).
  const healthReturn = !editId && prefill.type === 'sante' && urlChild ? `/app/enfants/${urlChild.id}/sante` : undefined
  const backHref = editing ? `/app/calendrier/${editId}` : (prefill.source?.href ?? healthReturn ?? '/app/calendrier')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!title.trim()) { document.getElementById('ev-title')?.focus(); return }
    if (!date) return
    if (childMissing) { pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); return }
    setSaving(true)
    setSaveError(null)
    const durationMin = existing ? Math.max(0, Math.round((new Date(existing.end).getTime() - new Date(existing.start).getTime()) / 60_000)) : 60
    const input = { type, title, date, time, location, description, childIds, durationMin, reminder, ...(hasFamily || familyChoice !== null ? { familyShared } : {}) }
    try {
      if (editId && existing) await updateEvent(editId, input)
      else await createEvent(input)
      if (!editing && prefill.source) { setSaved(true); setSaving(false); return }
      const healthChild = type === 'sante' && childIds.length === 1 ? childIds[0] : undefined
      router.push(editing ? `/app/calendrier/${editId}` : (healthReturn && healthChild ? `/app/enfants/${healthChild}/sante` : '/app/calendrier'))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.')
      setSaving(false)
    }
  }

  if (saved && prefill.source) {
    return (
      <>
        <TopBar title="Événement enregistré" showBack backHref={prefill.source.href} showBell={false} />
        <SuccessState
          compact
          title="C’est noté dans votre calendrier"
          description={`« ${title.trim()} » a bien été enregistré.`}
          primary={{ label: 'Retour au guide', href: prefill.source.href }}
          secondary={{ label: 'Voir le calendrier', href: '/app/calendrier' }}
        />
      </>
    )
  }

  // Événement partagé par un autre parent : lecture seule (seul l'auteur le modifie).
  if (existing?.sharedBy) {
    return (
      <>
        <TopBar title="Modifier l'événement" showBack backHref={`/app/calendrier/${existing.id}`} showBell={false} />
        <EmptyState
          title="Modification réservée à l’auteur"
          description={`Cet événement a été partagé par ${existing.sharedBy.prenom}. Vous pouvez le consulter, mais seul son auteur peut le modifier.`}
          primary={{ label: 'Voir l’événement', href: `/app/calendrier/${existing.id}` }}
        />
      </>
    )
  }

  return (
    <>
      <TopBar title={editing ? "Modifier l'événement" : 'Ajouter un événement'} showBack backHref={backHref} showBell={false} />

      <form onSubmit={onSubmit} noValidate className="space-y-5 px-4 pb-6 pt-3">
        {prefill.source && (
          <p className="flex items-start gap-2 rounded-xl bg-leaf-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-leaf-800">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            Formulaire pré-rempli depuis le Guide parental. Vérifiez les informations avant d’enregistrer.
          </p>
        )}

        <TypeTileGroup name="type" options={tiles} value={type} onChange={onType} />

        <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} dateError={dateError} />

        <TextField
          id="ev-title"
          label="Titre"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isHealth ? 'Ex : Pédiatre, vaccin, dentiste…' : 'Ex : Visite avec Lina'}
          maxLength={120}
          error={titleError}
        />

        <TextField
          label="Lieu"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={isHealth ? 'Ex : Cabinet du Dr Martin' : 'Ex : À mon domicile'}
          maxLength={200}
        />

        <TextAreaField
          label="Description (facultatif)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez l'événement…"
          maxLength={500}
        />

        <div ref={pickerRef}>
          <ChildrenPicker
            label={isHealth ? (childOptions.length > 1 ? 'Enfant concerné (obligatoire)' : 'Enfant concerné') : 'Enfants concernés'}
            options={childOptions}
            value={childIds}
            onChange={setChildIds}
          />
          {isHealth && !childError && (
            <p className="mt-1.5 text-xs text-night-600">Le rendez-vous apparaîtra dans l’espace Santé de l’enfant.</p>
          )}
          {childError && <p role="alert" className="mt-1.5 text-xs font-medium text-alert-600">{childError}</p>}
        </div>

        <div>
          <FieldLabel htmlFor="ev-reminder">Rappel</FieldLabel>
          <div className="relative">
            <select id="ev-reminder" value={reminder} onChange={(e) => setReminder(e.target.value as ReminderKey)} className={selectCls}>
              {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-700" />
          </div>
        </div>

        {hasFamily && (
          <div className="rounded-xl border border-night-100 bg-white px-4">
            <Switch
              label="Visible par l’autre parent"
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
          <SubmitBar disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</SubmitBar>
        </div>
      </form>
    </>
  )
}
