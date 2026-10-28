'use client'

import Link from 'next/link'
import { use, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  CalendarClock, CalendarPlus, ChevronRight, FileHeart, FilePlus2, History, Lock, NotebookPen, Pencil,
  Pill, Plus, ShieldAlert, Stethoscope, Syringe, Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { btn } from '@/components/onboarding/styles'
import { BackButton, EnfantsHeader } from '@/components/enfants/EnfantsHeader'
import { useChild } from '@/components/enfants/useChild'
import { HealthBadge, TreatmentForm, VaccinationForm } from '@/components/enfants/HealthForms'
import { HealthPrivacyNote } from '@/components/enfants/HealthPrivacyNote'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useCategories, useVaultDocs } from '@/components/coffre/store'
import { useVaultLockState } from '@/components/vault-lock/useVaultLockState'
import { VaultLockedNotice } from '@/components/vault-lock/VaultLockedNotice'
import { ConfirmDialog } from '@/components/ui'
import { ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import type { CalendarEvent } from '@/lib/calendrier'
import { useFamilyFormat } from '@/components/famille/useFamilyFormat'
import { useChildLabels } from '@/components/enfants/childLabels'
import { dayKeyInTz, dayKeyToDate, timeInTz } from '@/lib/tz'
import { useEvents } from '@/lib/data/calendar'
import { useJournalList, type JournalRecord } from '@/lib/data/journal'
import type { AsyncState } from '@/lib/data/core'
import {
  isTreatmentActive, reminderStatus, removeHealthItem, useChildHealth,
  type ChildHealth, type HealthKind, type Treatment, type Vaccination,
} from '@/lib/data/health'
import { matchCategory, prefillHref } from '@/lib/prefill'
import type { Child } from '@/lib/mock-data'

// Espace Santé de l'enfant : rendez-vous (calendrier, type `sante`), vaccinations, allergies,
// traitements, médecin, documents (coffre, catégorie Santé) et historique (rendez-vous passés +
// Journal `sante`). Données médicales chiffrées côté serveur (/api/enfants/[id]/{medical,sante}) ;
// les liens d'ajout ne transportent que des identifiants (aucune donnée médicale dans l'URL).

const card = 'min-w-0 scroll-mt-20 rounded-2xl border border-night-100 bg-white p-4 shadow-[0_1px_2px_rgba(11,45,91,0.06),0_8px_24px_-16px_rgba(11,45,91,0.12)]'

const SECTIONS = [
  { id: 'rendez-vous', labelKey: 'appointments' },
  { id: 'vaccinations', labelKey: 'vaccinations' },
  { id: 'allergies', labelKey: 'allergies' },
  { id: 'traitements', labelKey: 'treatments' },
  { id: 'medecin', labelKey: 'doctor' },
  { id: 'documents', labelKey: 'documents' },
  { id: 'historique', labelKey: 'history' },
] as const

export default function EnfantSantePage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('family.children.health')
  const { id } = use(params)
  const { child, loading, error, refresh } = useChild(id)
  const back = <BackButton href={`/app/enfants/${id}`} label={t('backToProfile')} />

  if (!child) {
    return (
      <div className="w-full px-4 pb-8 md:px-6">
        <EnfantsHeader title={t('title')} left={back} />
        {error ? (
          <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backToChildren'), href: '/app/enfants' }} />
        ) : loading ? (
          <LoadingState compact title={t('loading')} description="" />
        ) : (
          <>
            <p className="mt-10 text-center text-sm text-night-600">{t('notFound')}</p>
            <Link href="/app/enfants" className={cn(btn.secondary, 'mt-6 w-full')}>{t('backToChildren')}</Link>
          </>
        )}
      </div>
    )
  }
  return <HealthSpace child={child} back={back} />
}

function HealthSpace({ child, back }: { child: Child; back: ReactNode }) {
  const t = useTranslations('family.children.health')
  const now = useClientNow()
  // Jour courant dans le fuseau de l'utilisateur (rappels de vaccin, traitements en cours).
  const today = now ? dayKeyInTz(now) : ''
  const [announce, setAnnounce] = useState('')
  // Une seule lecture par source, partagée entre les rubriques.
  const health = useChildHealth(child.id)
  const events = useEvents()
  const journal = useJournalList()

  const addRdv = prefillHref('/app/calendrier/nouveau', { type: 'sante', enfant: child.id })
  const addDoc = prefillHref('/app/coffre/ajouter', { categorie: 'sante', enfant: child.id })

  return (
    <div className="w-full px-4 pb-8 md:px-6">
      <EnfantsHeader title={t('titleOf', { name: child.prenom })} left={back} />

      <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-night-600">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" strokeWidth={1.8} />
        <HealthPrivacyNote childId={child.id} />
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:max-w-2xl">
        <Link href={addRdv} className={btn.primary}>
          <CalendarPlus aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} /> {t('addAppointment')}
        </Link>
        <Link href={addDoc} className={btn.secondary}>
          <FilePlus2 aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} /> {t('addDocument')}
        </Link>
      </div>

      <nav aria-label={t('sectionsNav')} className="-mx-4 mt-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 px-0.5 py-1.5">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-flex min-h-[40px] items-center rounded-xl border border-night-100 bg-white px-3.5 text-[12.5px] font-semibold text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2">
                {t(`sections.${s.labelKey}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {!now ? (
        <LoadingState compact title={t('loading')} description="" />
      ) : (
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Appointments child={child} now={now} addHref={addRdv} events={events} />
          <Vaccinations child={child} today={today} onAnnounce={setAnnounce} health={health} />
          <Allergies child={child} />
          <Treatments child={child} today={today} onAnnounce={setAnnounce} health={health} />
          <Doctor child={child} />
          <Documents child={child} addHref={addDoc} />
          <HealthHistory child={child} now={now} events={events} journal={journal} />
        </div>
      )}
    </div>
  )
}

// --- Briques -------------------------------------------------------------------

function Section({ id, title, icon, action, children, className }: {
  id: string; title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn(card, className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-700">{icon}</span>
        <h2 id={`${id}-h`} className="flex-1 text-[15px] font-extrabold text-night-900">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-night-50/60 px-3.5 py-3 text-[13px] text-night-600">{children}</p>
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('family.children.health')
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-alert-50 px-3.5 py-3 text-[13px] text-alert-700">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onRetry} className="min-h-[40px] rounded-lg px-2 font-semibold text-alert-700 underline underline-offset-2">{t('retry')}</button>
    </div>
  )
}

function Loading() {
  const t = useTranslations('family.children.health')
  return <p className="px-1 py-2 text-[13px] text-night-500" role="status">{t('loadingShort')}</p>
}

function EditLink({ child, label }: { child: Child; label: string }) {
  return (
    <Link href={`/app/enfants/${child.id}/modifier`} aria-label={label} className="grid h-11 w-11 place-items-center rounded-full text-night-700 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
      <Pencil aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </Link>
  )
}

function AddToggle({ open, controls, label, onClick, btnRef }: {
  open: boolean; controls: string; label: string; onClick: () => void; btnRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={btnRef}
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2.5 text-[13px] font-semibold text-leaf-600 hover:bg-leaf-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
    >
      <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} /> {label}
    </button>
  )
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-500 hover:bg-alert-50 hover:text-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500">
      <Trash2 aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </button>
  )
}

const isHealthEventFor = (e: CalendarEvent, childId: string) => e.type === 'sante' && (e.childrenIds ?? []).includes(childId)

// --- Rendez-vous à venir --------------------------------------------------------

type Health = AsyncState<ChildHealth>
type Events = AsyncState<CalendarEvent[]>

function Appointments({ child, now, addHref, events }: { child: Child; now: Date; addHref: string; events: Events }) {
  const t = useTranslations('family.children.health')
  const fmt = useFamilyFormat()
  const { data, loading, error, refresh } = events
  const upcoming = useMemo(
    () => (data ?? [])
      .filter((e) => isHealthEventFor(e, child.id) && new Date(e.end).getTime() >= now.getTime())
      .sort((a, b) => a.start.localeCompare(b.start)),
    [data, child.id, now],
  )
  return (
    <Section id="rendez-vous" title={t('upcomingTitle')} icon={<CalendarClock className="h-5 w-5" strokeWidth={1.8} />}>
      {error ? <InlineError message={error.message} onRetry={() => void refresh()} />
        : loading && !data ? <Loading />
        : upcoming.length === 0 ? (
          <Empty>
            {t('noAppointments')}{' '}
            <Link href={addHref} className="font-semibold text-leaf-600 underline underline-offset-2">{t('addAppointmentShort')}</Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-night-100">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link href={`/app/calendrier/${e.id}`} className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-night-50/50">
                  <DateChip iso={e.start} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{fmt.day(dayKeyInTz(e.start))}, </span>
                    <span className="block truncate text-[13.5px] font-bold text-night-900">{e.title}</span>
                    <span className="block truncate text-[12px] text-night-600">
                      {fmt.hm(timeInTz(e.start))}{e.location && <><span aria-hidden="true"> · </span><span className="sr-only">, </span>{e.location}</>}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-night-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Section>
  )
}

function DateChip({ iso }: { iso: string }) {
  // Jour du rendez-vous dans le fuseau de l'utilisateur, rendu comme date « jour seul » (UTC).
  const { intl } = useFamilyFormat()
  const d = dayKeyToDate(dayKeyInTz(iso))
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700" aria-hidden="true">
      <span className="text-center leading-none">
        <span className="block text-[15px] font-extrabold">{d.getUTCDate()}</span>
        <span className="block text-[10px] font-semibold uppercase">{d.toLocaleDateString(intl, { month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
      </span>
    </span>
  )
}

// --- Vaccinations ---------------------------------------------------------------

function useRemoval(child: Child, onAnnounce: (s: string) => void, onRemoved: (kind: HealthKind, id: string) => void) {
  const t = useTranslations('family.children.health')
  const [target, setTarget] = useState<{ kind: HealthKind; id: string; nom: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  async function confirm() {
    if (!target) return
    setBusy(true)
    setFailure('')
    try {
      await removeHealthItem(child.id, target.kind, target.id)
      onRemoved(target.kind, target.id)
      onAnnounce(t('removedAnnounce', { name: target.nom }))
      setTarget(null)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('deleteFailed'))
      setTarget(null)
    } finally {
      setBusy(false)
    }
  }
  const dialog = (
    <ConfirmDialog
      open={!!target}
      onClose={() => setTarget(null)}
      onConfirm={confirm}
      loading={busy}
      title={t('deleteTitle', { name: target?.nom ?? '' })}
      description={t('deleteText')}
      confirmLabel={t('delete')}
    />
  )
  return { ask: setTarget, dialog, failure }
}

function Vaccinations({ child, today, onAnnounce, health }: { child: Child; today: string; onAnnounce: (s: string) => void; health: Health }) {
  const t = useTranslations('family.children.health')
  const fmt = useFamilyFormat()
  const { data, loading, error, refresh, setData } = health
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const removal = useRemoval(child, onAnnounce, (_k, id) => setData((h) => ({ vaccinations: (h?.vaccinations ?? []).filter((v) => v.id !== id), traitements: h?.traitements ?? [] })))
  const list = data?.vaccinations ?? []
  const formId = `vac-form-${child.id}`

  function added(v: Vaccination) {
    setData((h) => ({ ...(h ?? { traitements: [] }), vaccinations: [v, ...(h?.vaccinations ?? [])].sort((a, b) => b.date.localeCompare(a.date)) }))
    setOpen(false)
    onAnnounce(t('vaccinationAdded', { name: v.nom }))
    toggleRef.current?.focus()
  }

  return (
    <Section
      id="vaccinations"
      title={t('sections.vaccinations')}
      icon={<Syringe className="h-5 w-5" strokeWidth={1.8} />}
      action={<AddToggle open={open} controls={formId} label={t('add')} onClick={() => setOpen((o) => !o)} btnRef={toggleRef} />}
    >
      {error ? <InlineError message={error.message} onRetry={() => void refresh()} />
        : loading && !data ? <Loading />
        : list.length === 0 ? <Empty>{t('noVaccinations')}</Empty>
        : (
          <ul className="divide-y divide-night-100">
            {list.map((v) => {
              const st = reminderStatus(v, today)
              return (
                <li key={v.id} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13.5px] font-bold text-night-900">{v.nom}</p>
                    <p className="text-[12px] text-night-600">{t('doneOn', { date: fmt.day(v.date) })}</p>
                    {v.rappel && (
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-night-700">
                        {t('boosterOn', { date: fmt.day(v.rappel) })}
                        {st === 'overdue' && <HealthBadge tone="alert">{t('boosterOverdue')}</HealthBadge>}
                        {st === 'soon' && <HealthBadge tone="orange">{t('soon')}</HealthBadge>}
                      </p>
                    )}
                  </div>
                  {v.byMe !== false && <DeleteButton label={t('deleteVaccinationAria', { name: v.nom })} onClick={() => removal.ask({ kind: 'vaccination', id: v.id, nom: v.nom })} />}
                </li>
              )
            })}
          </ul>
        )}
      {data?.unavailable && <p className="mt-2 text-[12px] text-night-500">{t('partialUnavailable')}</p>}
      {removal.failure && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{removal.failure}</p>}
      <div id={formId} hidden={!open}>
        {open && <VaccinationForm childId={child.id} today={today} onDone={added} onCancel={() => { setOpen(false); toggleRef.current?.focus() }} />}
      </div>
      {removal.dialog}
    </Section>
  )
}

// --- Allergies --------------------------------------------------------------------

function Allergies({ child }: { child: Child }) {
  const t = useTranslations('family.children.health')
  const labels = useChildLabels()
  const items = [...(child.allergies ?? []).map(labels.allergyLabel), ...(child.autresAllergies ? [child.autresAllergies] : [])]
  return (
    <Section id="allergies" title={t('sections.allergies')} icon={<ShieldAlert className="h-5 w-5" strokeWidth={1.8} />} action={<EditLink child={child} label={t('editAllergiesAria', { name: child.prenom })} />}>
      {items.length === 0 ? <Empty>{t('noAllergies')}</Empty> : (
        <ul className="flex flex-wrap gap-2">
          {items.map((a) => (
            <li key={a} className="max-w-full break-words rounded-lg bg-alert-50 px-2.5 py-1 text-[12.5px] font-semibold text-alert-700">{a}</li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// --- Traitements ------------------------------------------------------------------

function Treatments({ child, today, onAnnounce, health }: { child: Child; today: string; onAnnounce: (s: string) => void; health: Health }) {
  const t = useTranslations('family.children.health')
  const fmt = useFamilyFormat()
  const { data, loading, error, refresh, setData } = health
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const removal = useRemoval(child, onAnnounce, (_k, id) => setData((h) => ({ vaccinations: h?.vaccinations ?? [], traitements: (h?.traitements ?? []).filter((tr) => tr.id !== id) })))
  const list = data?.traitements ?? []
  const formId = `trt-form-${child.id}`

  function added(tr: Treatment) {
    setData((h) => ({ ...(h ?? { vaccinations: [] }), traitements: [tr, ...(h?.traitements ?? [])].sort((a, b) => b.debut.localeCompare(a.debut)) }))
    setOpen(false)
    onAnnounce(t('treatmentAdded', { name: tr.nom }))
    toggleRef.current?.focus()
  }

  return (
    <Section
      id="traitements"
      title={t('sections.treatments')}
      icon={<Pill className="h-5 w-5" strokeWidth={1.8} />}
      action={<AddToggle open={open} controls={formId} label={t('add')} onClick={() => setOpen((o) => !o)} btnRef={toggleRef} />}
    >
      {child.traitement && (
        <p className="mb-2 rounded-xl bg-night-50/60 px-3.5 py-2.5 text-[12.5px] text-night-700">
          <span className="font-semibold text-night-900">{t('notedInProfile')} </span>{child.traitement}
        </p>
      )}
      {error ? <InlineError message={error.message} onRetry={() => void refresh()} />
        : loading && !data ? <Loading />
        : list.length === 0 ? <Empty>{t('noTreatments')}</Empty>
        : (
          <ul className="divide-y divide-night-100">
            {list.map((tr) => {
              const active = isTreatmentActive(tr, today)
              const future = tr.debut > today
              return (
                <li key={tr.id} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-night-900">
                      <span className="break-words">{tr.nom}</span>
                      {active ? <HealthBadge tone="leaf">{t('ongoing')}</HealthBadge> : future ? <HealthBadge tone="night">{t('upcoming')}</HealthBadge> : <HealthBadge tone="night">{t('finished')}</HealthBadge>}
                    </p>
                    {tr.posologie && <p className="break-words text-[12.5px] text-night-700">{tr.posologie}</p>}
                    <p className="text-[12px] text-night-600">
                      {tr.fin ? t('fromTo', { start: fmt.day(tr.debut), end: fmt.day(tr.fin) }) : t('fromNoEnd', { start: fmt.day(tr.debut) })}
                    </p>
                  </div>
                  {tr.byMe !== false && <DeleteButton label={t('deleteTreatmentAria', { name: tr.nom })} onClick={() => removal.ask({ kind: 'traitement', id: tr.id, nom: tr.nom })} />}
                </li>
              )
            })}
          </ul>
        )}
      {removal.failure && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{removal.failure}</p>}
      <div id={formId} hidden={!open}>
        {open && <TreatmentForm childId={child.id} onDone={added} onCancel={() => { setOpen(false); toggleRef.current?.focus() }} />}
      </div>
      {removal.dialog}
    </Section>
  )
}

// --- Médecin & fiche ------------------------------------------------------------

function Doctor({ child }: { child: Child }) {
  const t = useTranslations('family.children.health')
  const labels = useChildLabels()
  const rows: [string, string | undefined][] = [
    [t('doctorLabel'), child.medecinTraitant],
    [t('bloodGroup'), labels.bloodLabel(child.groupeSanguin)],
    [t('medicalInfo'), child.infosMedicales],
  ]
  return (
    <Section id="medecin" title={t('doctorTitle')} icon={<Stethoscope className="h-5 w-5" strokeWidth={1.8} />} action={<EditLink child={child} label={t('editMedicalAria', { name: child.prenom })} />}>
      <dl className="divide-y divide-night-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2 text-[13px]">
            <dt className="w-36 shrink-0 text-night-600">{k}</dt>
            <dd className={cn('min-w-0 flex-1 break-words', v ? 'font-semibold text-night-900' : 'italic text-night-500')}>{v || t('notProvided')}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

// --- Documents médicaux -----------------------------------------------------------

function Documents({ child, addHref }: { child: Child; addHref: string }) {
  // Documents du coffre-fort : affichés seulement coffre déverrouillé (sinon la base n'en
  // renvoie aucun, 0370, et « Aucun document » serait trompeur).
  const t = useTranslations('family.children.health')
  const { state: vault } = useVaultLockState()
  return (
    <Section id="documents" title={t('documentsTitle')} icon={<FileHeart className="h-5 w-5" strokeWidth={1.8} />}>
      {vault === 'open'
        ? <DocumentsList child={child} addHref={addHref} />
        : <VaultLockedNotice state={vault} what={t('documentsWhat', { name: child.prenom })} compact className="shadow-none" />}
    </Section>
  )
}

function DocumentsList({ child, addHref }: { child: Child; addHref: string }) {
  const t = useTranslations('family.children.health')
  const fmt = useFamilyFormat()
  const { docs, ready, error, refresh } = useVaultDocs()
  const { categories } = useCategories()
  const sante = matchCategory(categories, 'sante')
  const list = sante ? docs.filter((d) => d.categoryId === sante.id && (d.childIds ?? []).includes(child.id)) : []
  return (
    <>
      {error ? <InlineError message={error.message} onRetry={() => void refresh()} />
        : !ready ? <Loading />
        : list.length === 0 ? (
          <Empty>
            {t('noDocuments', { name: child.prenom })}{' '}
            <Link href={addHref} className="font-semibold text-leaf-600 underline underline-offset-2">{t('addDocumentShort')}</Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-night-100">
            {list.map((d) => (
              <li key={d.id}>
                <Link href={`/app/coffre/documents/${d.id}`} className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-night-50/50">
                  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-[10px] font-extrabold text-leaf-700">{d.ext}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-night-900">{d.name}</span>
                    <span className="block truncate text-[12px] text-night-600">{fmt.day(d.docDate)}{d.source && <><span aria-hidden="true"> · </span><span className="sr-only">, </span>{d.source}</>}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-night-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </>
  )
}

// --- Historique -------------------------------------------------------------------

type HistoryItem = { key: string; sort: string; day: string; time?: string; title: string; sub?: string; href: string; kind: 'rdv' | 'journal' }

function HealthHistory({ child, now, events, journal }: { child: Child; now: Date; events: Events; journal: AsyncState<JournalRecord[]> }) {
  const t = useTranslations('family.children.health')
  const fmt = useFamilyFormat()
  const items = useMemo<HistoryItem[]>(() => {
    const past = (events.data ?? [])
      .filter((e) => isHealthEventFor(e, child.id) && new Date(e.end).getTime() < now.getTime())
      .map<HistoryItem>((e) => {
        const day = dayKeyInTz(e.start)
        const time = timeInTz(e.start)
        return { key: `ev:${e.id}`, sort: `${day}T${time}`, day, time, title: e.title, sub: e.location, href: `/app/calendrier/${e.id}`, kind: 'rdv' }
      })
    const notes = (journal.data ?? [])
      .filter((j) => j.type === 'sante' && (j.childIds ?? []).includes(child.id))
      .map<HistoryItem>((j) => ({ key: `j:${j.id}`, sort: `${j.date}T${j.heure ?? '00:00'}`, day: j.date, time: j.heure, title: j.title, sub: j.lieu, href: `/app/journal/${j.id}`, kind: 'journal' }))
    return [...past, ...notes].sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 50)
  }, [events.data, journal.data, child.id, now])

  const failed = events.error ?? journal.error
  const loading = (events.loading && !events.data) || (journal.loading && !journal.data)

  return (
    <Section id="historique" title={t('historyTitle')} icon={<History className="h-5 w-5" strokeWidth={1.8} />} className="lg:col-span-2">
      {failed ? <InlineError message={failed.message} onRetry={() => { void events.refresh(); void journal.refresh() }} />
        : loading ? <Loading />
        : items.length === 0 ? <Empty>{t('historyEmpty')}</Empty>
        : (
          <ol className="relative ml-2 border-l border-night-100">
            {items.map((it) => (
              <li key={it.key} className="relative pl-5">
                <span aria-hidden="true" className={cn('absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full ring-2 ring-white', it.kind === 'rdv' ? 'bg-purple-500' : 'bg-leaf-500')} />
                <Link href={it.href} className="flex items-start gap-3 rounded-lg py-2.5 pr-1 hover:bg-night-50/50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-semibold text-night-600">
                      <time dateTime={it.day}>{fmt.day(it.day)}</time>
                      {it.time && it.time !== '00:00' && <> {t('atTime', { time: fmt.hm(it.time) })}</>}
                    </span>
                    <span className="block break-words text-[13.5px] font-bold text-night-900">{it.title}</span>
                    {it.sub && <span className="block truncate text-[12px] text-night-600">{it.sub}</span>}
                  </span>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-night-50 px-2 py-0.5 text-[11px] font-bold text-night-700">
                    {it.kind === 'rdv'
                      ? <><CalendarClock aria-hidden="true" className="h-3 w-3" /> {t('kindAppointment')}</>
                      : <><NotebookPen aria-hidden="true" className="h-3 w-3" /> {t('kindJournal')}</>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      <p className="mt-3 text-[12px] text-night-600">
        {t.rich('historyHint', {
          link: (chunks) => (
            <Link href={prefillHref('/app/journal/nouveau', { type: 'sante', enfant: child.id })} className="font-semibold text-leaf-600 underline underline-offset-2">{chunks}</Link>
          ),
        })}
      </p>
    </Section>
  )
}
