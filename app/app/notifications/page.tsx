'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarClock, ChevronRight, MessageSquareQuote, Sparkles, type LucideIcon } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { EmptyState, ErrorState, LoadingState } from '@/components/mobile/StateScreens'
import { cn } from '@/lib/cn'
import { LIVE } from '@/lib/data/core'
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

// Démonstration uniquement. Compte réel : table `notifications` (lib/data/notifications).
const DEMO_NOTIFICATIONS: Notif[] = [
  { id: 'n1', icon: MessageSquareQuote, tone: 'bg-iris-50 text-iris-600', title: 'Nouveau témoignage reçu', body: 'Hélène D. a répondu à votre demande de témoignage.', timeAgo: 'Il y a 5 min', href: '/app/coffre/temoignages', unread: true },
  { id: 'n2', icon: CalendarClock, tone: 'bg-leaf-50 text-leaf-600', title: 'Rappel calendrier', body: 'Rendez-vous médical avec Lina dans 2 h.', timeAgo: 'Il y a 1 h', href: '/app/calendrier/rappels', unread: true },
  { id: 'n3', icon: Sparkles, tone: 'bg-gold-50 text-gold-600', title: 'Coach IA renouvelé', body: 'Vous disposez de 10 nouvelles analyses ce mois-ci.', timeAgo: 'Hier', href: '/app/coach', unread: false },
]

function iconFor(type: string): Pick<Notif, 'icon' | 'tone'> {
  if (type.startsWith('temoignage')) return { icon: MessageSquareQuote, tone: 'bg-iris-50 text-iris-600' }
  if (type.startsWith('rappel') || type.includes('calendrier')) return { icon: CalendarClock, tone: 'bg-leaf-50 text-leaf-600' }
  if (type.startsWith('coach') || type.startsWith('ai')) return { icon: Sparkles, tone: 'bg-gold-50 text-gold-600' }
  return { icon: BellRing, tone: 'bg-night-50 text-night-700' }
}

const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (Math.abs(min) < 1) return 'À l’instant'
  if (Math.abs(min) < 60) return capitalize(rtf.format(min, 'minute'))
  const h = Math.round(min / 60)
  if (Math.abs(h) < 24) return capitalize(rtf.format(h, 'hour'))
  const d = Math.round(h / 24)
  if (Math.abs(d) < 7) return capitalize(rtf.format(d, 'day'))
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const rowClass = (unread: boolean) => cn(
  'flex items-start gap-3.5 rounded-2xl border bg-white p-3.5 shadow-soft transition-colors hover:bg-night-50/40',
  unread ? 'border-leaf-100' : 'border-night-100',
)

function toNotif(n: AppNotification): Notif {
  return { id: n.id, ...iconFor(n.type), title: n.title, body: n.body, timeAgo: timeAgo(n.createdAt), href: n.href, unread: n.unread }
}

export default function NotificationsPage() {
  return LIVE ? <LiveNotifications /> : <NotificationList initial={DEMO_NOTIFICATIONS} />
}

/** Compte réel : chargement, erreur, liste vide ou notifications du compte. */
function LiveNotifications() {
  const { data, loading, error, refresh } = useNotifications()
  const items = useMemo(() => (data ?? []).map(toNotif), [data])
  if (loading && !data) {
    return (
      <>
        <TopBar title="Notifications" showBack backHref="/app" showBell={false} />
        <LoadingState compact title="Chargement des notifications" description="" />
      </>
    )
  }
  if (error) {
    return (
      <>
        <TopBar title="Notifications" showBack backHref="/app" showBell={false} />
        <ErrorState compact description={error.message} primary={{ label: 'Réessayer', onClick: () => void refresh() }} secondary={{ label: "Retour à l'accueil", href: '/app' }} />
      </>
    )
  }
  return <NotificationList initial={items} live />
}

function NotificationList({ initial, live = false }: { initial: Notif[]; live?: boolean }) {
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
      setStatus('Toutes les notifications sont marquées comme lues.')
    } catch {
      setItems(before)
      setStatus('Impossible de marquer les notifications comme lues. Réessayez.')
    }
  }

  const markOne = (id: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, unread: false } : x)))
    if (live) void markNotificationRead(id).catch(() => { /* reste non lue au prochain chargement */ })
  }

  return (
    <>
      <TopBar title="Notifications" showBack backHref="/app" showBell={false} />
      <p className="sr-only" aria-live="polite">{status}</p>

      {items.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-11 w-11" strokeWidth={1.6} />}
          title="Aucune notification"
          description="Vos nouvelles alertes apparaîtront ici."
        />
      ) : (
        <div className="px-4 pb-6 pt-2">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-night-900">Récentes</h2>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={unread === 0}
              className="-mr-2 h-11 rounded-full px-3 text-xs font-bold text-leaf-700 hover:bg-leaf-50 disabled:text-night-400 disabled:hover:bg-transparent"
            >
              Tout marquer comme lu
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
              <span className="sr-only">(non lue)</span>
            </>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-night-600">{n.body}</span>
        <span className="mt-1 block text-[11px] text-night-500">{n.timeAgo}</span>
      </span>
    </>
  )
}
