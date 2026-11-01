'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarClock, CalendarDays, CalendarPlus, CircleDot, EllipsisVertical, MapPin, NotebookPen, Pencil, Repeat,
  Share2, StickyNote, Trash2, Users,
} from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { EventTypeBadge, EventTypeIcon } from '@/components/calendrier/eventTypeStyles'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { useRecurrenceLabel } from '@/components/calendrier/useRecurrenceLabel'
import { dayOf, fmtWallTime } from '@/lib/calendrier'
import { useChildOptions } from '@/lib/data/children'
import { SharedByBadge } from '@/components/famille/SharedByBadge'
import { removeEvent, setEventStatus, useEvent, type SeriesScope } from '@/lib/data/calendar'
import { EVENT_STATUSES, type EventStatus } from '@/lib/recurrence'
import { TIMEZONE_CHOICES } from '@/lib/timezones'
import { currentTz, timeInTz } from '@/lib/tz'

// M06 — Détail de l'événement. Occurrence d'une série (0660) : répétition, statut propre, et choix de portée
// (cette date, cette date et les suivantes, toute la série) avant de modifier ou de supprimer.
export default function EvenementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('calendar')
  const f = useCalFormat()
  const router = useRouter()
  const now = useClientNow()
  const { data: event, loading, error, refresh } = useEvent(id)
  const { options: childOptions } = useChildOptions()
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')
  const [scopeSheet, setScopeSheet] = useState<'edit' | 'delete' | null>(null)
  const [deleteScope, setDeleteScope] = useState<SeriesScope>('all')
  const [statusSaving, setStatusSaving] = useState(false)
  const recurrenceLabel = useRecurrenceLabel()
  const tTz = useTranslations('shared.timezones')
  const series = Boolean(event?.recurrence?.occurrence)
  const editHref = (scope?: SeriesScope) => `/app/calendrier/nouveau?id=${encodeURIComponent(event!.id)}${scope ? `&scope=${scope}` : ''}`
  const startEdit = () => (series ? setScopeSheet('edit') : router.push(editHref()))
  const startDelete = () => {
    if (series) { setScopeSheet('delete'); return }
    setDeleteScope('all')
    setConfirm(true)
  }

  const bar = <TopBar
    title={t('detail.title')}
    showBack
    backHref="/app/calendrier"
    showBell={false}
    rightSlot={event && !event.sharedBy && (
      <span className="-mr-2 flex">
        <button type="button" onClick={startEdit} aria-label={t('detail.edit')} className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50">
          <Pencil aria-hidden="true" className="h-[19px] w-[19px]" />
        </button>
        <button type="button" onClick={() => setSheet(true)} aria-label={t('detail.moreActions')} aria-haspopup="dialog" className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50">
          <EllipsisVertical aria-hidden="true" className="h-5 w-5" />
        </button>
      </span>
    )}
  />

  if (!event && (loading || error)) {
    return (
      <>
        {bar}
        {error ? (
          <ErrorState compact description={error.message} primary={{ label: t('common.retry'), onClick: () => void refresh() }} secondary={{ label: t('common.backToCalendar'), href: '/app/calendrier' }} />
        ) : (
          <LoadingState compact title={t('detail.loading')} description="" />
        )}
      </>
    )
  }

  if (!event) {
    return (
      <>
        {bar}
        <EmptyState
          title={t('common.eventNotFound')}
          description={t('common.eventNotFoundDesc')}
          primary={{ label: t('common.backToCalendar'), href: '/app/calendrier' }}
        />
      </>
    )
  }

  if (!now) return <>{bar}<LoadingState compact title={t('detail.loading')} description="" /></>

  const start = dayOf(event.start) // jour du fuseau de l'utilisateur
  const kids = childOptions.filter((c) => (event.childrenIds ?? []).includes(c.id)).map((c) => t('common.childOption', { name: c.prenom, count: c.age })).join(', ')
  // Série dans un autre fuseau que celui de l'utilisateur : heure murale de la série rappelée (« 18h, heure de Guyane »).
  const evTz = event.recurrence?.tz
  const tzKey = evTz ? TIMEZONE_CHOICES.find((c) => c.value === evTz)?.key : undefined
  const wallNote = evTz && evTz !== currentTz()
    ? t('detail.wallTime', { time: fmtWallTime(timeInTz(event.start, evTz), f.locale), tz: tzKey ? tTz(`zones.${tzKey}`) : evTz })
    : null
  const healthChild = event.type === 'sante' && event.childrenIds?.length === 1 ? childOptions.find((c) => c.id === event.childrenIds![0]) : undefined

  async function share() {
    const text = `${event!.title}\n${f.dateFull(start)} · ${f.hourRange(event!.start, event!.end)}${event!.location ? `\n${event!.location}` : ''}`
    try {
      if (navigator.share) { await navigator.share({ title: event!.title, text }); return }
      await navigator.clipboard.writeText(text)
      setNotice(t('detail.copied'))
    } catch { /* partage annulé */ }
  }

  async function onStatus(next: EventStatus) {
    setStatusSaving(true)
    try {
      await setEventStatus(event!.id, next)
      await refresh()
      setNotice(t('detail.statusSaved'))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setStatusSaving(false)
    }
  }

  async function onDelete() {
    setDeleting(true)
    try {
      await removeEvent(event!.id, deleteScope)
      router.push('/app/calendrier')
    } catch (err) {
      setDeleting(false)
      setConfirm(false)
      setNotice(err instanceof Error ? err.message : t('detail.deleteFailed'))
    }
  }

  const action = 'flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[13.5px] font-semibold transition-colors motion-safe:active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'

  return (
    <>
      {bar}
      <article className="px-4 pb-6 pt-3">
        <header className="flex flex-col items-center text-center">
          <EventTypeIcon type={event.type} size="lg" className="motion-safe:animate-fade-up" />
          <EventTypeBadge type={event.type} className="mt-2" />
          <h2 className="mt-3 text-[19px] font-extrabold leading-tight text-night-900">{event.title}</h2>
          <p className="mt-2 text-[13px] text-night-700">{f.dateFull(start)}</p>
          <p className="mt-0.5 text-[13px] tabular-nums text-night-700">
            {/* Sur plusieurs jours (week-end de visite…) : jour et heure de fin. */}
            {dayOf(event.end).getTime() !== start.getTime()
              ? `${f.hour(event.start)} → ${f.dayLong(dayOf(event.end))} ${f.hour(event.end)}`
              : f.hourRange(event.start, event.end)}
          </p>
          {event.sharedBy && <SharedByBadge prenom={event.sharedBy.prenom} className="mt-3 px-2 py-1 text-[12px]" />}
        </header>

        {event.sharedBy && (
          <p className="mt-4 rounded-xl bg-night-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-night-700">
            {t('detail.sharedNotice', { prenom: event.sharedBy.prenom })}
          </p>
        )}

        <dl className="mt-5 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
          <Row icon={<CalendarDays className="h-5 w-5" />} label={t('detail.dateTime')}>
            {t('common.dateAtTime', { date: f.dateFull(start), time: f.hour(event.start) })}
            {wallNote && <span className="block text-night-500">{wallNote}</span>}
          </Row>
          {event.recurrence && (
            <Row icon={<Repeat className="h-5 w-5" />} label={t('detail.repeat')}>
              {recurrenceLabel(event.recurrence.rule, event.recurrence.tz, event.recurrence.seriesStart ?? event.start)}
            </Row>
          )}
          <Row icon={<CircleDot className="h-5 w-5" />} label={t('detail.status')}>
            {event.sharedBy || (event.recurrence && !event.recurrence.occurrence) ? t(`detail.statuses.${event.status ?? 'prevu'}`) : (
              <span className="relative mt-1 block max-w-[220px]">
                <label htmlFor="ev-status" className="sr-only">{t('detail.statusLabel')}</label>
                <select
                  id="ev-status"
                  value={event.status ?? 'prevu'}
                  disabled={statusSaving}
                  onChange={(e) => void onStatus(e.target.value as EventStatus)}
                  className="h-10 w-full appearance-none rounded-lg border border-night-100 bg-white px-3 text-[12.5px] font-semibold text-night-900 focus:outline-none focus:ring-2 focus:ring-leaf-500/30"
                >
                  {EVENT_STATUSES.map((s) => <option key={s} value={s}>{t(`detail.statuses.${s}`)}</option>)}
                </select>
              </span>
            )}
          </Row>
          {event.location && <Row icon={<MapPin className="h-5 w-5" />} label={t('detail.location')}>{event.location}</Row>}
          {kids && (
            <Row icon={<Users className="h-5 w-5" />} label={event.type === 'sante' ? t('detail.childOne') : t('detail.childMany')}>
              {kids}
              {healthChild && (
                <>
                  {' '}
                  <Link href={`/app/enfants/${healthChild.id}/sante`} className="font-semibold text-leaf-600 underline underline-offset-2 hover:text-leaf-700">
                    {t('detail.healthLink', { prenom: healthChild.prenom })}
                  </Link>
                </>
              )}
            </Row>
          )}
          {event.description && (
            <Row icon={<StickyNote className="h-5 w-5" />} label={t('detail.description')}>
              <span className="whitespace-pre-wrap">{event.description}</span>
            </Row>
          )}
          {event.createdAt && (
            <Row icon={<CalendarClock className="h-5 w-5" />} label={t('detail.createdAt')}>
              {t('common.dateAtTime', { date: f.dateMedium(dayOf(event.createdAt)), time: f.hour(event.createdAt) })}
            </Row>
          )}
        </dl>

        <div className="mt-5 space-y-2.5">
          <button type="button" onClick={share} className={`${action} border border-night-200 bg-white text-night-900 hover:bg-night-50`}>
            <Share2 aria-hidden="true" className="h-[18px] w-[18px]" /> {t('detail.share')}
          </button>
          <Link href={`/app/calendrier/${event.id}/agenda`} className={`${action} border border-night-200 bg-white text-night-900 hover:bg-night-50`}>
            <CalendarPlus aria-hidden="true" className="h-[18px] w-[18px]" /> {t('detail.addToCalendar')}
          </Link>
          {!event.sharedBy && (
            <button type="button" onClick={startDelete} className={`${action} border border-alert-300 bg-white text-alert-600 hover:bg-alert-50`}>
              <Trash2 aria-hidden="true" className="h-[18px] w-[18px]" /> {t('detail.delete')}
            </button>
          )}
        </div>

        <p role="status" aria-live="polite" className="mt-3 min-h-[1rem] text-center text-xs font-medium text-leaf-700">{notice}</p>
      </article>

      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t('detail.actions')}
        actions={[
          { key: 'edit', label: t('detail.edit'), icon: <Pencil className="h-5 w-5" aria-hidden="true" />, onClick: startEdit },
          { key: 'journal', label: t('detail.toJournal'), icon: <NotebookPen className="h-5 w-5" aria-hidden="true" />, onClick: () => router.push(`/app/journal/nouveau?from=${event.id}`) },
          { key: 'delete', label: t('detail.delete'), variant: 'danger', icon: <Trash2 className="h-5 w-5" aria-hidden="true" />, onClick: startDelete },
        ]}
      />

      <ActionSheet
        open={scopeSheet !== null}
        onClose={() => setScopeSheet(null)}
        title={scopeSheet === 'delete' ? t('detail.deleteScopeTitle') : t('detail.editScopeTitle')}
        actions={(['one', 'following', 'all'] as const).map((scope) => ({
          key: scope,
          label: t(`detail.scope.${scope}`),
          ...(scopeSheet === 'delete' ? { variant: 'danger' as const } : {}),
          onClick: () => {
            if (scopeSheet === 'edit') router.push(editHref(scope))
            else { setDeleteScope(scope); setConfirm(true) }
          },
        }))}
      />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onDelete}
        loading={deleting}
        title={t('detail.confirmTitle')}
        description={series
          ? t(deleteScope === 'one' ? 'detail.deleteOneDesc' : deleteScope === 'following' ? 'detail.deleteFollowingDesc' : 'detail.deleteAllDesc', { date: f.dateMedium(start) })
          : t('detail.confirmDesc')}
        confirmLabel={t('detail.confirmLabel')}
      />
    </>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 py-3.5">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-leaf-600">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12px] font-bold text-night-900">{label}</dt>
        <dd className="mt-0.5 break-words text-[12px] leading-relaxed text-night-700">{children}</dd>
      </div>
    </div>
  )
}
