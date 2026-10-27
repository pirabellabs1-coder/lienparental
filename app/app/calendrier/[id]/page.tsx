'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarClock, CalendarDays, CalendarPlus, EllipsisVertical, MapPin, NotebookPen, Pencil,
  Share2, StickyNote, Trash2, Users,
} from 'lucide-react'
import { ActionSheet, ConfirmDialog } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { EventTypeBadge, EventTypeIcon } from '@/components/calendrier/eventTypeStyles'
import { useClientNow } from '@/components/calendrier/useClientNow'
import { useCalFormat } from '@/components/calendrier/useCalFormat'
import { dayOf } from '@/lib/calendrier'
import { useChildOptions } from '@/lib/data/children'
import { SharedByBadge } from '@/components/famille/SharedByBadge'
import { removeEvent, useEvent } from '@/lib/data/calendar'

// M06 — Détail de l'événement.
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

  const bar = <TopBar
    title={t('detail.title')}
    showBack
    backHref="/app/calendrier"
    showBell={false}
    rightSlot={event && !event.sharedBy && (
      <span className="-mr-2 flex">
        <Link href={`/app/calendrier/nouveau?id=${event.id}`} aria-label={t('detail.edit')} className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50">
          <Pencil aria-hidden="true" className="h-[19px] w-[19px]" />
        </Link>
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

  const start = dayOf(event.start) // jour DEFAULT_TZ
  const kids = childOptions.filter((c) => (event.childrenIds ?? []).includes(c.id)).map((c) => c.label).join(', ')
  const healthChild = event.type === 'sante' && event.childrenIds?.length === 1 ? childOptions.find((c) => c.id === event.childrenIds![0]) : undefined

  async function share() {
    const text = `${event!.title}\n${f.dateFull(start)} · ${f.hourRange(event!.start, event!.end)}${event!.location ? `\n${event!.location}` : ''}`
    try {
      if (navigator.share) { await navigator.share({ title: event!.title, text }); return }
      await navigator.clipboard.writeText(text)
      setNotice(t('detail.copied'))
    } catch { /* partage annulé */ }
  }

  async function onDelete() {
    setDeleting(true)
    try {
      await removeEvent(event!.id)
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
          <p className="mt-0.5 text-[13px] tabular-nums text-night-700">{f.hourRange(event.start, event.end)}</p>
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
            <button type="button" onClick={() => setConfirm(true)} className={`${action} border border-alert-300 bg-white text-alert-600 hover:bg-alert-50`}>
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
          { key: 'edit', label: t('detail.edit'), icon: <Pencil className="h-5 w-5" aria-hidden="true" />, onClick: () => router.push(`/app/calendrier/nouveau?id=${event.id}`) },
          { key: 'journal', label: t('detail.toJournal'), icon: <NotebookPen className="h-5 w-5" aria-hidden="true" />, onClick: () => router.push(`/app/journal/nouveau?from=${event.id}`) },
          { key: 'delete', label: t('detail.delete'), variant: 'danger', icon: <Trash2 className="h-5 w-5" aria-hidden="true" />, onClick: () => setConfirm(true) },
        ]}
      />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onDelete}
        loading={deleting}
        title={t('detail.confirmTitle')}
        description={t('detail.confirmDesc')}
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
