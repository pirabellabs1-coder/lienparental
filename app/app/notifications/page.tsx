'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { BellRing, CalendarClock, ChevronRight, MessageSquareQuote, Sparkles, type LucideIcon } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { cn } from '@/lib/cn'
import { LIVE } from '@/lib/data/core'
import { intlLocale } from '@/lib/i18n/config'
import { currentTz } from '@/lib/tz'
import {
  markAllNotificationsRead, markNotificationRead, useNotifications, type AppNotification,
} from '@/lib/data/notifications'

type Notif = {
  id: string
  icon: LucideIcon
  tone: string
  title: string
  body: string
  timeAgo: string
  href: string | null
  unread: boolean
}

type T = ReturnType<typeof useTranslations>

// Démonstration uniquement. Compte réel : table `notifications` (lib/data/notifications).
// Textes traduits au rendu : account.notifications.demo.{id}.
const DEMO_NOTIFICATIONS = [
  { id: 'n1', icon: MessageSquareQuote, tone: 'bg-iris-50 text-iris-600', href: '/app/coffre/temoignages', unread: true },
  { id: 'n2', icon: CalendarClock, tone: 'bg-leaf-50 text-leaf-600', href: '/app/calendrier/rappels', unread: true },
  { id: 'n3', icon: Sparkles, tone: 'bg-gold-50 text-gold-600', href: '/app/coach', unread: false },
] as const

function demoNotifications(t: T): Notif[] {
  return DEMO_NOTIFICATIONS.map(n => ({
    ...n,
    title: t(`demo.${n.id}.title`),
    body: t(`demo.${n.id}.body`),
    timeAgo: t(`demo.${n.id}.time`),
  }))
}

function iconFor(type: string): Pick<Notif, 'icon' | 'tone'> {
  if (type.startsWith('temoignage')) return { icon: MessageSquareQuote, tone: 'bg-iris-50 text-iris-600' }
  if (type.startsWith('rappel') || type.includes('calendrier')) return { icon: CalendarClock, tone: 'bg-leaf-50 text-leaf-600' }
  if (type.startsWith('coach') || type.startsWith('ai')) return { icon: Sparkles, tone: 'bg-gold-50 text-gold-600' }
  return { icon: BellRing, tone: 'bg-night-50 text-night-700' }
}

function timeAgo(iso: string, t: T, locale: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const min = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (Math.abs(min) < 1) return t('justNow')
  if (Math.abs(min) < 60) return capitalize(rtf.format(min, 'minute'))
  const h = Math.round(min / 60)
  if (Math.abs(h) < 24) return capitalize(rtf.format(h, 'hour'))
  const d = Math.round(h / 24)
  if (Math.abs(d) < 7) return capitalize(rtf.format(d, 'day'))
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: currentTz() })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const rowClass = (unread: boolean) => cn(
  'flex items-start gap-3.5 rounded-2xl border bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40',
  unread ? 'border-leaf-100' : 'border-night-100',
)

function toNotif(n: AppNotification, t: T, locale: string): Notif {
  return { id: n.id, ...iconFor(n.type), title: n.title, body: n.body, timeAgo: timeAgo(n.createdAt, t, locale), href: n.href, unread: n.unread }
}

export default function NotificationsPage() {
  return LIVE ? <LiveNotifications /> : <DemoNotifications />
}

function DemoNotifications() {
  const t = useTranslations('account.notifications')
  const initial = useMemo(() => demoNotifications(t), [t])
  return <NotificationList initial={initial} />
}

/** Compte réel : chargement, erreur, liste vide ou notifications du compte. */
function LiveNotifications() {
  const t = useTranslations('account.notifications')
  const locale = useLocale()
  const { data, loading, error, refresh } = useNotifications()
  const items = useMemo(() => (data ?? []).map(n => toNotif(n, t, locale)), [data, t, locale])
  if (loading && !data) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
        <LoadingState compact title={t('loading')} description="" />
      </>
    )
  }
  if (error) {
    return (
      <>
        <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
        <ErrorState compact description={error.message} primary={{ label: t('retry'), onClick: () => void refresh() }} secondary={{ label: t('backHome'), href: '/app' }} />
      </>
    )
  }
  return <NotificationList initial={items} live />
}

function NotificationList({ initial, live = false }: { initial: Notif[]; live?: boolean }) {
  const t = useTranslations('account.notifications')
  const [items, setItems] = useState<Notif[]>(initial)
  const [status, setStatus] = useState('')
  useEffect(() => setItems(initial), [initial])
  const unread = items.filter((n) => n.unread).length

  const markAll = async () => {
    const before = items
    setItems((xs) => xs.map((n) => ({ ...n, unread: false })))
    if (!live) return
    try {
      await markAllNotificationsRead()
      setStatus(t('allRead'))
    } catch {
      setItems(before)
      setStatus(t('allReadError'))
    }
  }

  const markOne = (id: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, unread: false } : x)))
    if (live) void markNotificationRead(id).catch(() => { /* reste non lue au prochain chargement */ })
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
      <p className="sr-only" aria-live="polite">{status}</p>

      {items.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-11 w-11" strokeWidth={1.6} />}
          title={t('emptyTitle')}
          description={t('emptyText')}
        />
      ) : (
        <div className="px-4 pb-6 pt-2">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-night-900">{t('recent')}</h2>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={unread === 0}
              className="-mr-2 h-11 rounded-full px-3 text-xs font-bold text-leaf-700 hover:bg-leaf-50 disabled:text-night-400 disabled:hover:bg-transparent"
            >
              {t('markAll')}
            </button>
          </div>

          <ul className="space-y-2.5">
            {items.map((n) => (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} onClick={() => markOne(n.id)} className={rowClass(n.unread)}>
                    <RowBody n={n} />
                    <ChevronRight aria-hidden="true" className="mt-3 h-[18px] w-[18px] shrink-0 text-night-700" />
                  </Link>
                ) : (
                  <button type="button" onClick={() => markOne(n.id)} className={cn(rowClass(n.unread), 'w-full text-left')}>
                    <RowBody n={n} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function RowBody({ n }: { n: Notif }) {
  const t = useTranslations('account.notifications')
  const Icon = n.icon
  return (
    <>
      <span aria-hidden="true" className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', n.tone)}>
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="flex-1 text-[13px] font-bold text-night-900">{n.title}</span>
          {n.unread && (
            <>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-leaf-500" />
              <span className="sr-only">{t('unread')}</span>
            </>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-night-600">{n.body}</span>
        <span className="mt-1 block text-[11px] text-night-500">{n.timeAgo}</span>
      </span>
    </>
  )
}
