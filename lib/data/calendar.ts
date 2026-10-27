'use client'

/**
 * Calendrier — couche de données.
 * - Supabase : table `calendar_events` (RLS user_id = auth.uid()), soft delete.
 *   Famille (0340, docs/FAMILLE.md) : la RLS renvoie aussi les événements `family_shared`
 *   des autres adultes liés ; ils portent `sharedBy` et restent en lecture seule
 *   (modification / suppression filtrées sur user_id = moi).
 * - Démo : EVENTS de lib/calendrier (comportement historique, sans écriture)
 *   + FAMILY_DEMO_EVENTS (partagés par l'autre parent).
 *
 * Correspondances UI ↔ BDD :
 *   type  'appel' ↔ 'appel_video', 'rdv' ↔ 'rendez_vous' (les autres sont identiques) ;
 *   rappel '15m' ↔ 15 min, '1h' ↔ 60 min, 'eve20' ↔ minutes jusqu'à la veille 20h, 'none' ↔ NULL.
 */
import { z } from 'zod'
import { EVENTS, FAMILY_DEMO_EVENTS, eveReminderAt, getEventById, type CalendarEvent, type EventTypeKey, type ReminderKey } from '@/lib/calendrier'
import { wallTimeToIso } from '@/lib/tz'
import { DataError, LIVE, dataMsg, db, requireUserId, toDataError, useAsyncData, uuid } from './core'
import { pushCalendarSync } from '@/lib/integrations/google/client'
import { kickNotifications } from '@/lib/notify/client'
import { familyAuthorNames, sharedByLabel } from './family'

type DbType =
  | 'visite' | 'appel_video' | 'message' | 'sante' | 'rendez_vous' | 'ecole'
  | 'activite' | 'sortie' | 'repas' | 'deplacement' | 'anniversaire' | 'autre'

type EventRow = {
  id: string
  type: DbType
  titre: string
  description: string | null
  lieu: string | null
  start_at: string
  end_at: string | null
  children_ids: string[]
  reminder_minutes: number | null
  created_at: string
  user_id: string
  family_shared: boolean | null
}

const COLUMNS = 'id, type, titre, description, lieu, start_at, end_at, children_ids, reminder_minutes, created_at, user_id, family_shared'

/** Utilisateur courant + prénoms des adultes liés (badge « Partagé par… »). */
type Viewer = { userId: string; names: Map<string, string> }

const toDbType = (t: EventTypeKey): DbType => (t === 'appel' ? 'appel_video' : t === 'rdv' ? 'rendez_vous' : t)
const fromDbType = (t: DbType): EventTypeKey => (t === 'appel_video' ? 'appel' : t === 'rendez_vous' ? 'rdv' : t)

function reminderMinutes(key: ReminderKey | undefined, startIso: string): number | null {
  if (!key || key === 'none') return null
  if (key === '15m') return 15
  if (key === '1h') return 60
  // « La veille à 20h » dans DEFAULT_TZ (pas dans le fuseau du navigateur).
  const eve = new Date(eveReminderAt(startIso))
  return Math.max(0, Math.round((new Date(startIso).getTime() - eve.getTime()) / 60_000))
}

function reminderKey(min: number | null): ReminderKey | undefined {
  if (min == null) return undefined
  if (min === 15) return '15m'
  if (min === 60) return '1h'
  return 'eve20'
}

function fromRow(r: EventRow, viewer?: Viewer): CalendarEvent {
  const end = r.end_at ?? new Date(new Date(r.start_at).getTime() + 3_600_000).toISOString()
  const foreign = Boolean(viewer && r.user_id && r.user_id !== viewer.userId)
  return {
    id: r.id,
    title: r.titre,
    type: fromDbType(r.type),
    start: r.start_at,
    end,
    location: r.lieu ?? undefined,
    description: r.description ?? undefined,
    childrenIds: r.children_ids ?? [],
    // Le rappel est celui de l'auteur : il n'est pas repris pour l'adulte lié.
    reminder: foreign ? undefined : reminderKey(r.reminder_minutes),
    createdAt: r.created_at,
    familyShared: Boolean(r.family_shared),
    ...(foreign && viewer ? { sharedBy: { prenom: sharedByLabel(viewer.names.get(r.user_id)) } } : {}),
  }
}

async function viewer(): Promise<Viewer> {
  const [userId, names] = await Promise.all([requireUserId(), familyAuthorNames()])
  return { userId, names }
}

/** Seul l'auteur modifie ou supprime un événement (filtre user_id, en plus de la RLS propriétaire). */
const NOT_AUTHOR = () => dataMsg('calendar.notAuthor')

const TYPES = ['visite', 'appel', 'message', 'sante', 'rdv', 'ecole', 'activite', 'sortie', 'repas', 'deplacement', 'anniversaire', 'autre'] as const

const inputSchema = () => z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(1, dataMsg('calendar.titleRequired')).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, dataMsg('calendar.dateRequired')),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  /** Durée en minutes (défaut 60). */
  durationMin: z.number().int().min(0).max(24 * 60 * 14).optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  childIds: z.array(z.string()).max(20),
  reminder: z.enum(['none', '15m', '1h', 'eve20']).optional(),
  /** Partage avec la famille (0340). Absent : défaut de la base (true à la création). */
  familyShared: z.boolean().optional(),
})
export type EventInput = z.infer<ReturnType<typeof inputSchema>>

function toRow(input: EventInput) {
  const p = inputSchema().safeParse(input)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? dataMsg('errors.invalid'), 'invalid')
  const v = p.data
  // Saisie = heure murale DEFAULT_TZ.
  const start = wallTimeToIso(v.date, v.time || '09:00')
  const end = new Date(new Date(start).getTime() + (v.durationMin ?? 60) * 60_000).toISOString()
  return {
    type: toDbType(v.type),
    titre: v.title,
    description: v.description || null,
    lieu: v.location || null,
    start_at: start,
    end_at: end,
    all_day: false,
    children_ids: v.childIds,
    reminder_minutes: reminderMinutes(v.reminder, start),
    reminder_sent_at: null, // toute modification réarme le rappel
    ...(v.familyShared === undefined ? {} : { family_shared: v.familyShared }),
  }
}

/**
 * Rendez-vous santé : toujours rattaché à un enfant (espace Santé de la fiche enfant).
 * Aucun enfant choisi : rattachement automatique s'il n'y en a qu'un, refus s'il y en a plusieurs.
 */
export const SANTE_CHILD_REQUIRED = 'Choisissez l’enfant concerné par ce rendez-vous santé.'

async function withHealthChild(input: EventInput): Promise<EventInput> {
  if (input.type !== 'sante' || input.childIds.length > 0) return input
  const { data, error } = await db().from('children').select('id').is('deleted_at', null).limit(2)
  if (error) throw toDataError(error, 'calendar.healthChild')
  const ids = ((data ?? []) as { id: string }[]).map((c) => c.id)
  if (ids.length === 1) return { ...input, childIds: ids }
  if (ids.length > 1) throw new DataError(dataMsg('calendar.healthChildRequired'), 'invalid')
  return input
}

// --- API --------------------------------------------------------------------

/** Événements de −12 mois à +24 mois (fenêtre bornée, index (user_id, start_at)). */
export async function listEvents(): Promise<CalendarEvent[]> {
  if (!LIVE) return DEMO_LIST
  const now = new Date()
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear() + 2, now.getMonth(), 1).toISOString()
  const who = await viewer()
  const { data, error } = await db()
    .from('calendar_events')
    .select(COLUMNS)
    .is('deleted_at', null)
    .gte('start_at', from)
    .lt('start_at', to)
    .order('start_at', { ascending: true })
    .limit(2000)
  if (error) throw toDataError(error, 'calendar.list')
  return ((data ?? []) as EventRow[]).map((r) => fromRow(r, who))
}

const DEMO_LIST: CalendarEvent[] = [...EVENTS, ...FAMILY_DEMO_EVENTS]
const demoEvent = (id: string) => getEventById(id) ?? FAMILY_DEMO_EVENTS.find((e) => e.id === id)

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  if (!LIVE) return demoEvent(id) ?? null
  if (!z.string().uuid().safeParse(id).success) return null
  const [who, { data, error }] = await Promise.all([
    viewer(),
    db().from('calendar_events').select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle(),
  ])
  if (error) throw toDataError(error, 'calendar.get')
  return data ? fromRow(data as EventRow, who) : null
}

/** Démo : aucune persistance (comportement historique). */
export async function createEvent(input: EventInput): Promise<string | null> {
  let row = toRow(input)
  if (!LIVE) return null
  row = toRow(await withHealthChild(input))
  const userId = await requireUserId()
  const id = uuid()
  const { error } = await db().from('calendar_events').insert({ ...row, id, user_id: userId, ics_uid: `${id}@lienparental.fr` })
  if (error) throw toDataError(error, 'calendar.create')
  pushCalendarSync(id, 'upsert') // Google Agenda (chantier G), sans effet si non relié
  kickNotifications() // événement partagé : l'autre parent est prévenu tout de suite
  return id
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  let row = toRow(input)
  if (!LIVE) {
    if (demoEvent(id)?.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    return
  }
  row = toRow(await withHealthChild(input))
  const userId = await requireUserId()
  const { data, error } = await db().from('calendar_events').update(row).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'calendar.update')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
  pushCalendarSync(id, 'upsert')
  kickNotifications()
}

export async function removeEvent(id: string): Promise<void> {
  if (!LIVE) {
    if (demoEvent(id)?.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    return
  }
  const userId = await requireUserId()
  const { data, error } = await db()
    .from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'calendar.remove')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
  pushCalendarSync(id, 'delete')
  kickNotifications()
}

// --- Hooks ------------------------------------------------------------------

export function useEvents() {
  return useAsyncData<CalendarEvent[]>(listEvents, 'calendar', LIVE ? undefined : DEMO_LIST)
}

export function useEvent(id: string | null) {
  return useAsyncData<CalendarEvent | null>(
    () => (id ? getEvent(id) : Promise.resolve(null)),
    `event:${id ?? ''}`,
    LIVE ? undefined : id ? (demoEvent(id) ?? null) : null,
  )
}
