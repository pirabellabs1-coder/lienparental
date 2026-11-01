/**
 * Rappels des événements récurrents (0660). Les séries n'ont pas d'instant unique : le cron des
 * notifications développe chaque série (lib/recurrence) sur la fenêtre utile et met en file chaque
 * occurrence dont le rappel est échu. Clé d'idempotence = (série, destinataire, début effectif) : une
 * occurrence déplacée reçoit un nouveau rappel, une occurrence supprimée ou annulée n'en reçoit aucun,
 * et la vérification à la livraison (lib/notify/server → calendar_reminder) écarte un rappel devenu obsolète.
 *
 * `dueOccurrences` est pur (testé) ; `enqueueRecurringReminders` lit la base (service_role).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { expandEvent, type CalendarEvent, type OccurrenceException } from '@/lib/calendrier'
import type { EventStatus } from '@/lib/recurrence'
import { DEFAULT_TZ, isValidTz } from '@/lib/tz'

export type RecurringTarget = {
  event_id: string
  user_id: string
  mins: number
  start_at: string
  end_at: string | null
  rrule: string
  tzid: string
}

export type ExceptionRow = {
  event_id: string
  occurrence_start: string
  deleted: boolean
  start_at: string | null
  end_at: string | null
  status: EventStatus | null
}

/** Un événement commencé depuis plus de 10 min ne reçoit plus de rappel (même règle que 0440). */
const LATE_MS = 10 * 60_000

export function toException(r: ExceptionRow): OccurrenceException {
  return {
    occurrence: r.occurrence_start,
    deleted: r.deleted,
    ...(r.start_at && r.end_at ? { start: r.start_at, end: r.end_at } : {}),
    ...(r.status ? { status: r.status } : {}),
  }
}

/** Occurrences dont le rappel est échu à `now` : { début prévu (clé), début effectif }. */
export function dueOccurrences(t: RecurringTarget, exceptions: OccurrenceException[], now: Date): { occurrence: string; start: string }[] {
  const master: CalendarEvent = {
    id: t.event_id, title: '', type: 'autre', start: t.start_at,
    end: t.end_at ?? new Date(Date.parse(t.start_at) + 3_600_000).toISOString(),
    recurrence: { rule: t.rrule, tz: isValidTz(t.tzid) ? t.tzid : DEFAULT_TZ },
  }
  const from = new Date(now.getTime() - LATE_MS).toISOString()
  const to = new Date(now.getTime() + t.mins * 60_000 + 1).toISOString()
  return expandEvent(master, exceptions, from, to)
    .filter((o) => o.status !== 'annule')
    .filter((o) => {
      const s = Date.parse(o.start)
      return s > now.getTime() - LATE_MS && s - t.mins * 60_000 <= now.getTime()
    })
    .map((o) => ({ occurrence: o.recurrence!.occurrence!, start: new Date(o.start).toISOString() }))
}

export async function enqueueRecurringReminders(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { data, error } = await db.rpc('notif_calendar_recurring_targets', { p_limit: 2000 })
  if (error) {
    console.warn('[notify] séries récurrentes non lues', { code: error.code })
    return 0
  }
  const targets = (Array.isArray(data) ? data : []) as RecurringTarget[]
  if (targets.length === 0) return 0
  const ids = [...new Set(targets.map((t) => t.event_id))]
  const exceptions = new Map<string, OccurrenceException[]>()
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows, error: excErr } = await db.from('calendar_event_exceptions')
      .select('event_id, occurrence_start, deleted, start_at, end_at, status').in('event_id', ids.slice(i, i + 150))
    if (excErr) {
      console.warn('[notify] exceptions de séries non lues', { code: excErr.code })
      return 0
    }
    for (const r of (rows ?? []) as ExceptionRow[]) {
      exceptions.set(r.event_id, [...(exceptions.get(r.event_id) ?? []), toException(r)])
    }
  }
  const pending: { t: RecurringTarget; o: { occurrence: string; start: string }; key: string }[] = []
  for (const t of targets) {
    // Une série illisible ne doit jamais bloquer les rappels des autres.
    try {
      for (const o of dueOccurrences(t, exceptions.get(t.event_id) ?? [], now)) {
        pending.push({ t, o, key: `calendar_reminder:${t.event_id}:${t.user_id}:${Math.floor(Date.parse(o.start) / 1000)}` })
      }
    } catch {
      console.warn('[notify] série ignorée', { event: t.event_id })
    }
  }
  // Rappels déjà en file (passages précédents du cron) : écartés en lot, sans RPC par occurrence.
  const queued = new Set<string>()
  for (let i = 0; i < pending.length; i += 200) {
    const { data: rows } = await db.from('notification_jobs').select('dedupe_key').in('dedupe_key', pending.slice(i, i + 200).map((x) => x.key))
    for (const r of (rows ?? []) as { dedupe_key: string }[]) queued.add(r.dedupe_key)
  }
  let count = 0
  for (const { t, o, key } of pending) {
    if (queued.has(key)) continue
    const { error: qErr } = await db.rpc('_notif_enqueue', {
      p_user_id: t.user_id,
      p_event: 'calendar_reminder',
      p_payload: { event_id: t.event_id, start_at: o.start, occurrence: o.occurrence },
      p_dedupe_key: key,
    })
    if (!qErr) count++
  }
  return count
}
