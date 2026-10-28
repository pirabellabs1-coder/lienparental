import 'server-only'
/**
 * Dispatcher central (serveur) : `notify(userId, event, payload)`.
 * Branche le cœur pur (core.ts) sur Supabase (service_role), web-push et Resend.
 *
 *   await notify(userId, 'security_change', { change: 'password_changed' }, { dedupeKey: '…' })
 *
 * Ne lève jamais d'exception. Sans SUPABASE_SERVICE_ROLE_KEY (démo) : no-op journalisé.
 * Les événements produits EN BASE ne passent pas par ici directement : les
 * déclencheurs de 0440 déposent des tâches, livrées par jobs.ts (cron + flush).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { dispatch, type DispatchDeps, type DispatchResult } from './core'
import { prefsFromRow, isSecurityChange, type Channel, type NotifyEvent } from './events'
import type { Facts } from './content'
import { maskEmail } from './device'
import { sendPushToUser } from './push'
import { toLocale } from '@/lib/email/i18n'
import { tzFromPreferencesRow } from '@/lib/timezones'
import { isModerationKind, isModerationReason } from '@/lib/admin/ops/moderation'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const UUID = /^[0-9a-f-]{36}$/i
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null)

export function serviceDb(): SupabaseClient | null {
  try {
    return createServiceClient() as unknown as SupabaseClient
  } catch {
    return null
  }
}

async function firstName(db: SupabaseClient, id: string | null): Promise<string> {
  if (!id) return ''
  const { data } = await db.from('users').select('prenom').eq('id', id).maybeSingle()
  return ((data as { prenom?: string | null } | null)?.prenom ?? '').trim()
}

type CalendarRow = { titre: string; type: string; start_at: string; all_day: boolean; deleted: boolean; author_id: string; visible: boolean; child_name: string | null }

async function calendarFor(db: SupabaseClient, userId: string, eventId: string | null): Promise<CalendarRow | null> {
  if (!eventId) return null
  const { data, error } = await db.rpc('notif_calendar_event_for', { p_user_id: userId, p_event_id: eventId })
  if (error) throw new Error(`calendar_${error.code ?? 'error'}`)
  const row = (Array.isArray(data) ? data[0] : data) as CalendarRow | undefined
  return row && row.visible ? row : null
}

export function realDeps(db: SupabaseClient): DispatchDeps {
  return {
    async loadRecipient(userId) {
      const [{ data: u, error }, { data: p }] = await Promise.all([
        db.from('users').select('email, prenom, deleted_at').eq('id', userId).maybeSingle(),
        db.from('preferences').select('notif_push, notif_email, notif_rappels, ui, langue').eq('user_id', userId).maybeSingle(),
      ])
      if (error) throw new Error(`recipient_${error.code ?? 'error'}`)
      const user = u as { email?: string | null; prenom?: string | null; deleted_at?: string | null } | null
      if (!user) return null
      return {
        email: user.email ?? null,
        prenom: (user.prenom ?? '').trim(),
        deleted: Boolean(user.deleted_at),
        prefs: prefsFromRow(p as Parameters<typeof prefsFromRow>[0]),
        // Langue du destinataire (fr | en | pt ; toute autre valeur → fr).
        locale: toLocale((p as { langue?: string | null } | null)?.langue),
        // Fuseau du destinataire : heures des rappels, partages et alertes (repli DEFAULT_TZ).
        tz: tzFromPreferencesRow(p as { ui?: unknown } | null),
      }
    },

    async loadFacts(userId, event, payload): Promise<Facts | null> {
      const actorId = uuid(payload.actor_id)
      switch (event) {
        case 'login_new_device':
          return { event, appareil: str(payload.appareil) || 'Appareil', systeme: str(payload.systeme) || 'Navigateur', dateIso: str(payload.date) || new Date().toISOString() }
        case 'security_change': {
          if (!isSecurityChange(payload.change)) return null
          return {
            event, change: payload.change, dateIso: str(payload.date) || new Date().toISOString(),
            ...(payload.new_email ? { newEmailMasked: maskEmail(str(payload.new_email)) } : {}),
          }
        }
        case 'message_received': {
          const conv = uuid(payload.conversation_id)
          if (!conv) return null
          // Toujours participant actif à la livraison (départ de la conversation entre-temps).
          const { data: part } = await db.from('conversation_participants').select('user_id')
            .eq('conversation_id', conv).eq('user_id', userId).is('left_at', null).maybeSingle()
          if (!part) return null
          return { event, conversationId: conv, actorName: await firstName(db, actorId) }
        }
        case 'message_email': {
          const conv = uuid(payload.conversation_id)
          if (!conv) return null
          const { data, error } = await db.rpc('notif_conversation_unread', { p_user_id: userId, p_conversation_id: conv })
          if (error) throw new Error(`unread_${error.code ?? 'error'}`)
          const row = (Array.isArray(data) ? data[0] : data) as { unread?: number; senders?: string[] } | undefined
          const unread = row?.unread ?? 0
          if (unread <= 0) return null
          return { event, conversationId: conv, unread, senders: row?.senders ?? [] }
        }
        case 'coparent_invite_accepted':
          return { event, actorName: await firstName(db, actorId), role: payload.role === 'proche' ? 'proche' : 'parent' }
        case 'vault_folder_shared': {
          const shareId = uuid(payload.share_id)
          const folderId = uuid(payload.folder_id)
          if (!shareId || !folderId) return null
          const { data } = await db.from('vault_folder_shares').select('revoked_at').eq('id', shareId).maybeSingle()
          if (!data || (data as { revoked_at: string | null }).revoked_at) return null
          return { event, folderId, actorName: await firstName(db, actorId) }
        }
        case 'testimony_received': {
          const id = uuid(payload.testimony_id)
          if (!id) return null
          const { data } = await db.from('testimonies').select('reference, temoin').eq('id', id).eq('user_id', userId).maybeSingle()
          if (!data) return null
          const t = data as { reference?: string; temoin?: { prenom?: string } | null }
          return { event, reference: t.reference ?? '', witnessFirstName: str(t.temoin?.prenom).slice(0, 40) }
        }
        case 'calendar_reminder': {
          const id = uuid(payload.event_id)
          const ev = await calendarFor(db, userId, id)
          if (!ev || ev.deleted) return null
          // Événement déplacé depuis la mise en file : un autre rappel suivra.
          if (payload.start_at && Date.parse(str(payload.start_at)) !== Date.parse(ev.start_at)) return null
          return { event, eventId: id!, titre: ev.titre, startAt: ev.start_at, allDay: ev.all_day, kind: ev.type, childName: ev.child_name }
        }
        case 'calendar_shared': {
          const id = uuid(payload.event_id)
          const ev = await calendarFor(db, userId, id)
          if (!ev) return null
          const action = payload.action === 'deleted' || ev.deleted ? 'deleted' : payload.action === 'updated' ? 'updated' : 'created'
          return {
            event, eventId: id!, action, titre: ev.titre, startAt: ev.start_at, allDay: ev.all_day, kind: ev.type, childName: ev.child_name,
            actorName: await firstName(db, ev.author_id),
          }
        }
        case 'coparent_activity': {
          const entity = payload.entity === 'garde' ? 'garde' : payload.entity === 'expense' ? 'expense' : null
          if (!entity || !actorId) return null
          // Toujours lié à l'auteur à la livraison (lien rompu entre-temps : rien).
          const { data: linked, error: linkErr } = await db.rpc('messaging_linked', { p_a: actorId, p_b: userId })
          if (linkErr) throw new Error(`linked_${linkErr.code ?? 'error'}`)
          if (linked !== true) return null
          return {
            event, entity, entityId: str(payload.entity_id).slice(0, 64),
            action: payload.action === 'created' ? 'created' : 'updated', actorName: await firstName(db, actorId),
          }
        }
        case 'welcome':
          return { event }
        case 'account_moderation': {
          // Charge utile construite par le serveur admin (lib/admin/ops/comptes.ts), revalidée ici.
          if (!isModerationKind(payload.kind)) return null
          const reasonCode = isModerationReason(payload.reason_code) ? payload.reason_code : null
          if (payload.kind !== 'reactivation' && !reasonCode) return null
          const until = str(payload.until)
          return {
            event, kind: payload.kind, reasonCode,
            details: str(payload.details).trim().slice(0, 500) || null,
            until: payload.kind === 'suspension' && !Number.isNaN(Date.parse(until)) ? until : null,
          }
        }
      }
    },

    async insertInApp(row) {
      const { error } = await db.from('notifications').upsert(
        {
          user_id: row.userId, channel: 'inapp', type: row.type, title: row.title.slice(0, 200), body: row.body.slice(0, 500),
          data: { href: row.href }, dedupe_key: row.dedupeKey.slice(0, 300), sent_at: new Date().toISOString(),
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      if (error) throw new Error(`inapp_${error.code ?? 'error'}`)
    },

    sendPush: (userId, msg) => sendPushToUser(db, userId, msg),

    async sendEmail(args) {
      const res = await sendEmail(args)
      return { ok: res.ok }
    },
  }
}

export type NotifyOptions = { dedupeKey: string; alreadyDelivered?: readonly Channel[] }

/** Livre immédiatement une notification. Jamais d'exception. */
export async function notify(userId: string, event: NotifyEvent, payload: Record<string, unknown>, opts: NotifyOptions): Promise<DispatchResult> {
  const db = serviceDb()
  if (!db) {
    console.info('[notify] désactivé (SUPABASE_SERVICE_ROLE_KEY absent)', { event })
    return { status: 'skipped', delivered: [], failed: [], reason: 'not_configured' }
  }
  return dispatch(realDeps(db), { userId, event, payload, dedupeKey: opts.dedupeKey, alreadyDelivered: opts.alreadyDelivered })
}
