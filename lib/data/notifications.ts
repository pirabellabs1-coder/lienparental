'use client'

/**
 * Notifications de l'application.
 * - Supabase : table `notifications` (0007 ; RLS select / update self, 0100 ; MFA, 0270).
 *   Écrites uniquement par le service_role (rappels, webhooks) ; le navigateur lit et
 *   marque comme lu (`read_at`). Les journaux d'e-mails (channel = 'email') ne sont pas affichés.
 * - Démonstration : liste fictive de l'écran Notifications (inchangée).
 */
import { useEffect, useState } from 'react'
import { mockUser } from '@/lib/mock-data'
import { LIVE, db, toDataError, useAsyncData } from './core'

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string
  createdAt: string
  /** Lien interne de l'application (toujours /app/…), sinon null. */
  href: string | null
  unread: boolean
}

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

const COLUMNS = 'id, type, title, body, data, read_at, created_at'
const CHANNELS = ['inapp', 'push']

/** N'accepte qu'un chemin interne de l'espace parent (pas de redirection ouverte). */
function safeHref(v: unknown): string | null {
  if (typeof v !== 'string') return null
  if (!/^\/app(\/[\w\-./?=&%]*)?$/.test(v) || v.includes('//')) return null
  let decoded: string
  try { decoded = decodeURIComponent(v) } catch { return null }
  // « /app/../admin » ou « /app/%2e%2e/admin » sortiraient de l'espace /app.
  return /(^|\/)\.\.?(\/|$|\?)/.test(decoded) || decoded.includes('//') ? null : v
}

function fromRow(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body ?? '',
    createdAt: r.created_at,
    href: safeHref(r.data?.href),
    unread: r.read_at === null,
  }
}

export async function listNotifications(): Promise<AppNotification[]> {
  if (!LIVE) return []
  const { data, error } = await db()
    .from('notifications')
    .select(COLUMNS)
    .in('channel', CHANNELS)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw toDataError(error, 'notifications.list')
  return ((data ?? []) as NotificationRow[]).map(fromRow)
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!LIVE) return
  const { error } = await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
  if (error) throw toDataError(error, 'notifications.read')
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!LIVE) return
  const { error } = await db().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).in('channel', CHANNELS)
  if (error) throw toDataError(error, 'notifications.readAll')
}

export function useNotifications() {
  return useAsyncData<AppNotification[]>(listNotifications, 'notifications', LIVE ? undefined : [])
}

/**
 * Nombre de notifications non lues (pastille de la cloche).
 * Démonstration : compteur fictif historique. Compte réel : 0 tant que rien n'est chargé
 * ou en cas d'erreur (jamais de pastille inventée).
 */
export function useUnreadNotificationsCount(): number {
  const [count, setCount] = useState(LIVE ? 0 : mockUser.notifications)
  useEffect(() => {
    if (!LIVE) return
    let alive = true
    ;(async () => {
      const { count: n, error } = await db()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .in('channel', CHANNELS)
      if (alive && !error) setCount(n ?? 0)
    })().catch(() => { /* pastille masquée */ })
    return () => { alive = false }
  }, [])
  return count
}
