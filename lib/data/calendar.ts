'use client'

/**
 * Calendrier — couche de données.
 * - Supabase : table `calendar_events` (RLS user_id = auth.uid()), soft delete.
 *   Famille (0340, docs/FAMILLE.md) : la RLS renvoie aussi les événements `family_shared`
 *   des autres adultes liés ; ils portent `sharedBy` et restent en lecture seule
 *   (modification / suppression filtrées sur user_id = moi).
 *   Récurrence (0660) : une série = une ligne (rrule RFC 5545 + tzid) ; ses occurrences sont calculées
 *   pour la période lue (lib/recurrence, lib/calendrier → expandEvent) ; une occurrence modifiée,
 *   déplacée ou supprimée = une ligne de `calendar_event_exceptions`. Identifiant d'occurrence :
 *   « idSérie~début prévu (ms) ».
 * - Démo : EVENTS de lib/calendrier (comportement historique, sans écriture)
 *   + FAMILY_DEMO_EVENTS (partagés par l'autre parent) ; séries et exceptions créées pendant la
 *   session en sessionStorage.
 *
 * Correspondances UI ↔ BDD :
 *   type  'appel' ↔ 'appel_video', 'rdv' ↔ 'rendez_vous' (les autres sont identiques) ;
 *   rappel '5m' … '2d' ↔ minutes (REMINDER_MINUTES), 'eve20' ↔ minutes jusqu'à la veille 20h, 'none' ↔ NULL.
 */
import { z } from 'zod'
import {
  EVENTS, FAMILY_DEMO_EVENTS, REMINDER_MINUTES, eveReminderAt, expandEvent, findOccurrence, getEventById, occurrenceOf,
  parseOccurrenceId, type CalendarEvent, type EventTypeKey, type OccurrenceException, type ReminderKey,
} from '@/lib/calendrier'
import { EVENT_STATUSES, firstOccurrence, formatRule, parseRule, seriesEnd, truncateBefore, type EventStatus } from '@/lib/recurrence'
import { currentTz, isValidTz, wallTimeToIso } from '@/lib/tz'
import { DataError, LIVE, dataMsg, db, requireUserId, toDataError, useAsyncData, uuid } from './core'
import { demoId, hasId, readDemoList, writeDemoList } from './demo-session'
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
  rrule: string | null
  tzid: string | null
  status: EventStatus | null
}

type ExceptionRow = {
  event_id: string
  occurrence_start: string
  deleted: boolean
  start_at: string | null
  end_at: string | null
  titre: string | null
  lieu: string | null
  description: string | null
  status: EventStatus | null
}

const COLUMNS = 'id, type, titre, description, lieu, start_at, end_at, children_ids, reminder_minutes, created_at, user_id, family_shared, rrule, tzid, status'
const EXC_COLUMNS = 'event_id, occurrence_start, deleted, start_at, end_at, titre, lieu, description, status'

/** Utilisateur courant + prénoms des adultes liés (badge « Partagé par… »). */
type Viewer = { userId: string; names: Map<string, string> }

/** Portée d'une modification ou d'une suppression d'occurrence. */
export type SeriesScope = 'one' | 'following' | 'all'

const toDbType = (t: EventTypeKey): DbType => (t === 'appel' ? 'appel_video' : t === 'rdv' ? 'rendez_vous' : t)
const fromDbType = (t: DbType): EventTypeKey => (t === 'appel_video' ? 'appel' : t === 'rendez_vous' ? 'rdv' : t)

function reminderMinutes(key: ReminderKey | undefined, startIso: string): number | null {
  if (!key || key === 'none') return null
  const fixed = REMINDER_MINUTES[key]
  if (fixed != null) return fixed
  // « La veille à 20h » dans le fuseau de l'utilisateur (pas dans le fuseau du navigateur).
  const eve = new Date(eveReminderAt(startIso))
  return Math.max(0, Math.round((new Date(startIso).getTime() - eve.getTime()) / 60_000))
}

function reminderKey(min: number | null): ReminderKey | undefined {
  if (min == null) return undefined
  const fixed = (Object.entries(REMINDER_MINUTES) as [ReminderKey, number][]).find(([, m]) => m === min)
  return fixed ? fixed[0] : 'eve20'
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
    status: r.status ?? 'prevu',
    ...(r.rrule ? { recurrence: { rule: r.rrule, tz: r.tzid && isValidTz(r.tzid) ? r.tzid : currentTz() } } : {}),
    ...(foreign && viewer ? { sharedBy: { prenom: sharedByLabel(viewer.names.get(r.user_id)) } } : {}),
  }
}

function fromExceptionRow(r: ExceptionRow): OccurrenceException {
  return {
    occurrence: r.occurrence_start,
    deleted: r.deleted,
    ...(r.start_at && r.end_at ? { start: r.start_at, end: r.end_at } : {}),
    ...(r.titre ? { title: r.titre } : {}),
    ...(r.lieu != null ? { location: r.lieu } : {}),
    ...(r.description != null ? { description: r.description } : {}),
    ...(r.status ? { status: r.status } : {}),
  }
}

async function viewer(): Promise<Viewer> {
  const [userId, names] = await Promise.all([requireUserId(), familyAuthorNames()])
  return { userId, names }
}

/** Seul l'auteur modifie ou supprime un événement (filtre user_id, en plus de la RLS propriétaire). */
const NOT_AUTHOR = () => dataMsg('calendar.notAuthor')

const TYPES = ['visite', 'appel', 'message', 'sante', 'rdv', 'ecole', 'activite', 'sortie', 'repas', 'deplacement', 'anniversaire', 'autre'] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

const inputSchema = () => z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(1, dataMsg('calendar.titleRequired')).max(120),
  date: z.string().regex(DAY, dataMsg('calendar.dateRequired')),
  time: z.string().regex(TIME).optional().or(z.literal('')),
  /** Fin (jour + heure murale) ; sinon début + durationMin. */
  endDate: z.string().regex(DAY).optional(),
  endTime: z.string().regex(TIME).optional(),
  /** Durée en minutes (défaut 60), si la fin n'est pas donnée. */
  durationMin: z.number().int().min(0).max(24 * 60 * 14).optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  childIds: z.array(z.string()).max(20),
  reminder: z.enum(['none', '5m', '15m', '30m', '1h', '1d', '2d', 'eve20']).optional(),
  /** Partage avec la famille (0340). Absent : défaut de la base (true à la création). */
  familyShared: z.boolean().optional(),
  /** Règle de répétition (lib/recurrence → formatRule) ; null / absent = ponctuel. */
  recurrence: z.string().max(300).nullable().optional(),
  /** Fuseau IANA de l'heure murale saisie (défaut : fuseau de l'utilisateur). */
  tz: z.string().max(64).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
})
export type EventInput = z.infer<ReturnType<typeof inputSchema>>

function parseInput(input: EventInput) {
  const p = inputSchema().safeParse(input)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? dataMsg('errors.invalid'), 'invalid')
  const v = p.data
  const tz = v.tz && isValidTz(v.tz) ? v.tz : currentTz()
  // Saisie = heure murale dans le fuseau de l'événement.
  const start = wallTimeToIso(v.date, v.time || '09:00', tz)
  const end = v.endDate && v.endTime
    ? wallTimeToIso(v.endDate, v.endTime, tz)
    : new Date(new Date(start).getTime() + (v.durationMin ?? 60) * 60_000).toISOString()
  if (Date.parse(end) < Date.parse(start)) throw new DataError(dataMsg('calendar.endBeforeStart'), 'invalid')
  if (Date.parse(end) - Date.parse(start) > 14 * 86_400_000) throw new DataError(dataMsg('calendar.endBeforeStart'), 'invalid')
  let rrule: string | null = null
  let occursUntil: string | null = null
  let s0 = start
  let e0 = end
  if (v.recurrence) {
    const rule = parseRule(v.recurrence)
    if (!rule) throw new DataError(dataMsg('calendar.invalidRule'), 'invalid')
    rrule = formatRule(rule)
    if (rule.kind === 'rrule') {
      const first = firstOccurrence({ start, end, tz, rule })
      if (!first) throw new DataError(dataMsg('calendar.invalidRule'), 'invalid')
      s0 = first.start
      e0 = first.end
    }
    occursUntil = seriesEnd({ start: s0, end: e0, tz, rule })
  }
  return { v, tz, start: s0, end: e0, rrule, occursUntil }
}

function toRow(input: EventInput) {
  const { v, tz, start, end, rrule, occursUntil } = parseInput(input)
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
    rrule,
    tzid: tz,
    occurs_until: occursUntil,
    ...(v.status ? { status: v.status } : {}),
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

// --- Lecture ------------------------------------------------------------------

/** Période lue : −12 mois à +24 mois (séries développées sur cette même période). */
function readWindow(): { from: string; to: string } {
  const now = new Date()
  return {
    from: new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString(),
    to: new Date(now.getFullYear() + 2, now.getMonth(), 1).toISOString(),
  }
}

async function loadExceptions(seriesIds: string[]): Promise<Map<string, OccurrenceException[]>> {
  const out = new Map<string, OccurrenceException[]>()
  for (let i = 0; i < seriesIds.length; i += 150) {
    const { data, error } = await db().from('calendar_event_exceptions').select(EXC_COLUMNS).in('event_id', seriesIds.slice(i, i + 150))
    if (error) throw toDataError(error, 'calendar.list')
    for (const r of (data ?? []) as ExceptionRow[]) {
      const list = out.get(r.event_id) ?? []
      list.push(fromExceptionRow(r))
      out.set(r.event_id, list)
    }
  }
  return out
}

function expandAll(masters: CalendarEvent[], exceptions: (id: string) => OccurrenceException[], from: string, to: string): CalendarEvent[] {
  return masters
    .flatMap((m) => expandEvent(m, exceptions(m.id), from, to))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/**
 * Événements de la période (séries développées en occurrences).
 * `expand: false` : une ligne par série (dossier, recherche), sans occurrences.
 */
export async function listEvents(opts: { expand?: boolean } = {}): Promise<CalendarEvent[]> {
  const expand = opts.expand ?? true
  const { from, to } = readWindow()
  if (!LIVE) {
    const masters = [...demoCreated(), ...DEMO_LIST]
    if (!expand) return masters
    const exc = demoExceptions()
    return expandAll(masters, (id) => exc.filter((e) => e.eventId === id), from, to)
  }
  const who = await viewer()
  const { data, error } = await db()
    .from('calendar_events')
    .select(COLUMNS)
    .is('deleted_at', null)
    .lt('start_at', to)
    .gte('occurs_until', from)
    .order('start_at', { ascending: true })
    .limit(2000)
  if (error) throw toDataError(error, 'calendar.list')
  const masters = ((data ?? []) as EventRow[]).map((r) => fromRow(r, who))
  if (!expand) return masters
  const exc = await loadExceptions(masters.filter((m) => m.recurrence).map((m) => m.id))
  return expandAll(masters, (id) => exc.get(id) ?? [], from, to)
}

const DEMO_LIST: CalendarEvent[] = [...EVENTS, ...FAMILY_DEMO_EVENTS]
const demoEvent = (id: string) => getEventById(id) ?? FAMILY_DEMO_EVENTS.find((e) => e.id === id)

// Démo : événements créés pendant la session (sessionStorage, même mécanisme que le journal).
const DEMO_EVENTS_KEY = 'lp_demo_events_v1'
const DEMO_EXC_KEY = 'lp_demo_event_exceptions_v1'
type DemoException = OccurrenceException & { id: string; eventId: string }
const isDemoEvent = (v: unknown): v is CalendarEvent =>
  hasId(v) && typeof (v as CalendarEvent).title === 'string' && typeof (v as CalendarEvent).start === 'string'
const isDemoException = (v: unknown): v is DemoException =>
  hasId(v) && typeof (v as DemoException).eventId === 'string' && typeof (v as DemoException).occurrence === 'string'
const demoCreated = () => readDemoList(DEMO_EVENTS_KEY, isDemoEvent)
const demoExceptions = () => readDemoList(DEMO_EXC_KEY, isDemoException)

function demoFromInput(id: string, input: EventInput, createdAt: string): CalendarEvent {
  const row = toRow(input)
  return fromRow({
    ...row, id, created_at: createdAt, user_id: 'demo', family_shared: row.family_shared ?? true, status: row.status ?? 'prevu',
  } as EventRow)
}

/** Série (ou événement ponctuel) telle qu'enregistrée, sans développement. */
async function getMaster(id: string): Promise<CalendarEvent | null> {
  if (!LIVE) return demoCreated().find((e) => e.id === id) ?? demoEvent(id) ?? null
  if (!z.string().uuid().safeParse(id).success) return null
  const [who, { data, error }] = await Promise.all([
    viewer(),
    db().from('calendar_events').select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle(),
  ])
  if (error) throw toDataError(error, 'calendar.get')
  return data ? fromRow(data as EventRow, who) : null
}

async function getException(seriesId: string, occurrence: string): Promise<OccurrenceException | undefined> {
  if (!LIVE) {
    return demoExceptions().find((e) => e.eventId === seriesId && Date.parse(e.occurrence) === Date.parse(occurrence))
  }
  const { data, error } = await db().from('calendar_event_exceptions').select(EXC_COLUMNS)
    .eq('event_id', seriesId).eq('occurrence_start', occurrence).maybeSingle()
  if (error) throw toDataError(error, 'calendar.get')
  return data ? fromExceptionRow(data as ExceptionRow) : undefined
}

/** Un événement : ponctuel, série (id de la série) ou occurrence (« idSérie~ms »). */
export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const occ = parseOccurrenceId(id)
  if (!occ) return getMaster(id)
  const master = await getMaster(occ.seriesId)
  if (!master?.recurrence) return null
  return occurrenceOf(master, occ.occurrence, await getException(occ.seriesId, occ.occurrence))
}

// --- Écriture -----------------------------------------------------------------

/** Démo : conservé pour la session (sessionStorage). */
export async function createEvent(input: EventInput, extra: { seriesParentId?: string } = {}): Promise<string | null> {
  let row = toRow(input)
  if (!LIVE) {
    const ev = demoFromInput(demoId('ev'), input, new Date().toISOString())
    writeDemoList(DEMO_EVENTS_KEY, [ev, ...demoCreated()], 100)
    return ev.id
  }
  row = toRow(await withHealthChild(input))
  const userId = await requireUserId()
  const id = uuid()
  const { error } = await db().from('calendar_events').insert({
    ...row, id, user_id: userId, ics_uid: `${id}@lienparental.fr`,
    ...(extra.seriesParentId ? { series_parent_id: extra.seriesParentId } : {}),
  })
  if (error) throw toDataError(error, 'calendar.create')
  pushCalendarSync(id, 'upsert') // Google Agenda (chantier G), sans effet si non relié
  kickNotifications() // événement partagé : l'autre parent est prévenu tout de suite
  return id
}

async function updateMaster(id: string, patch: Record<string, unknown>): Promise<void> {
  const userId = await requireUserId()
  const { data, error } = await db().from('calendar_events').update(patch).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'calendar.update')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
}

/** Exceptions d'une série à partir d'une occurrence (incluse) : retirées (scission, changement de règle). */
async function dropExceptions(seriesId: string, fromOccurrence?: string): Promise<void> {
  if (!LIVE) {
    writeDemoList(DEMO_EXC_KEY, demoExceptions().filter((e) => e.eventId !== seriesId || (fromOccurrence && Date.parse(e.occurrence) < Date.parse(fromOccurrence))), 500)
    return
  }
  let q = db().from('calendar_event_exceptions').delete().eq('event_id', seriesId)
  if (fromOccurrence) q = q.gte('occurrence_start', fromOccurrence)
  const { error } = await q
  if (error) throw toDataError(error, 'calendar.update')
}

type ExceptionPatch = Partial<Omit<ExceptionRow, 'event_id' | 'occurrence_start'>>

/** Exceptions d'une série à partir d'une occurrence (incluse). */
async function exceptionsFrom(seriesId: string, fromOccurrence: string): Promise<OccurrenceException[]> {
  if (!LIVE) return demoExceptions().filter((e) => e.eventId === seriesId && Date.parse(e.occurrence) >= Date.parse(fromOccurrence))
  const { data, error } = await db().from('calendar_event_exceptions').select(EXC_COLUMNS)
    .eq('event_id', seriesId).gte('occurrence_start', fromOccurrence)
  if (error) throw toDataError(error, 'calendar.update')
  return ((data ?? []) as ExceptionRow[]).map(fromExceptionRow)
}

async function upsertException(master: CalendarEvent, occurrence: string, patch: ExceptionPatch): Promise<void> {
  if (master.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
  if (!findOccurrence(master, occurrence)) throw new DataError(dataMsg('calendar.occurrenceNotFound'), 'invalid')
  if (!LIVE) {
    const list = demoExceptions()
    const prev = list.find((e) => e.eventId === master.id && Date.parse(e.occurrence) === Date.parse(occurrence))
    const base: DemoException = prev ?? { id: demoId('exc'), eventId: master.id, occurrence, deleted: false }
    const next: DemoException = {
      ...base,
      ...('deleted' in patch ? { deleted: Boolean(patch.deleted) } : {}),
      ...('start_at' in patch ? { start: patch.start_at ?? undefined, end: patch.end_at ?? undefined } : {}),
      ...('titre' in patch ? { title: patch.titre ?? undefined } : {}),
      ...('lieu' in patch ? { location: patch.lieu ?? undefined } : {}),
      ...('description' in patch ? { description: patch.description ?? undefined } : {}),
      ...('status' in patch ? { status: patch.status ?? undefined } : {}),
    }
    writeDemoList(DEMO_EXC_KEY, [next, ...list.filter((e) => e !== prev)], 500)
    return
  }
  const userId = await requireUserId()
  const { error } = await db().from('calendar_event_exceptions')
    .upsert({ event_id: master.id, user_id: userId, occurrence_start: occurrence, ...patch }, { onConflict: 'event_id,occurrence_start' })
  if (error) throw toDataError(error, 'calendar.update')
}

/** L'occurrence est-elle la première de la série ? (« et les suivantes » = toute la série) */
function isFirstOccurrence(master: CalendarEvent, occurrence: string): boolean {
  const rule = master.recurrence ? parseRule(master.recurrence.rule) : null
  if (!rule || !master.recurrence) return true
  const first = firstOccurrence({ start: master.start, end: master.end, tz: master.recurrence.tz, rule })
  return !first || Date.parse(occurrence) <= Date.parse(first.key)
}

const scheduleChanged = (prev: CalendarEvent, row: ReturnType<typeof toRow>) =>
  Date.parse(prev.start) !== Date.parse(row.start_at) || Date.parse(prev.end) !== Date.parse(row.end_at)
  || (prev.recurrence?.rule ?? null) !== row.rrule || (prev.recurrence ? prev.recurrence.tz !== row.tzid : false)

/**
 * Modifie un événement.
 * - Ponctuel ou série entière (`scope` 'all', id de la série ou d'une occurrence) : la ligne est mise à jour ;
 *   si l'horaire ou la règle change, les occurrences modifiées une à une sont réinitialisées.
 * - Occurrence seule ('one') : exception (déplacement = « reporté », texte, statut).
 * - Occurrence et suivantes ('following') : la série s'arrête avant l'occurrence, une nouvelle série
 *   (saisie du formulaire) prend la suite ; l'historique de la première reste intact.
 */
export async function updateEvent(id: string, input: EventInput, scope: SeriesScope = 'all'): Promise<string> {
  const occ = parseOccurrenceId(id)
  const masterId = occ?.seriesId ?? id
  const master = LIVE ? await getMaster(masterId) : (demoCreated().find((e) => e.id === masterId) ?? demoEvent(masterId) ?? null)
  if (!master) throw new DataError(dataMsg('calendar.occurrenceNotFound'), 'invalid')
  if (master.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')

  if (occ && master.recurrence && scope === 'one') {
    // Une occurrence garde l'heure saisie telle quelle (pas de calage sur la règle).
    const { v, start, end } = parseInput({ ...input, recurrence: null })
    const o = findOccurrence(master, occ.occurrence)
    if (!o) throw new DataError(dataMsg('calendar.occurrenceNotFound'), 'invalid')
    const prev = await getException(master.id, occ.occurrence)
    const moved = Date.parse(start) !== Date.parse(o.start) || Date.parse(end) !== Date.parse(o.end)
    const status = v.status ?? (moved && !prev?.status ? 'reporte' : undefined)
    await upsertException(master, occ.occurrence, {
      deleted: false,
      start_at: moved ? start : null,
      end_at: moved ? end : null,
      titre: v.title !== master.title ? v.title : null,
      lieu: (v.location || '') !== (master.location ?? '') ? (v.location ?? '') : null,
      description: (v.description || '') !== (master.description ?? '') ? (v.description ?? '') : null,
      ...(status ? { status } : {}),
    })
    if (LIVE) { pushCalendarSync(master.id, 'upsert'); kickNotifications() }
    return id
  }

  if (occ && master.recurrence && scope === 'following') {
    const rule = parseRule(master.recurrence.rule)
    if (rule && !isFirstOccurrence(master, occ.occurrence)) {
      parseInput(input) // saisie validée avant de toucher à la série d'origine
      const truncated = truncateBefore(rule, occ.occurrence)
      const series = { start: master.start, end: master.end, tz: master.recurrence.tz, rule: truncated }
      const future = await exceptionsFrom(master.id, occ.occurrence)
      if (!LIVE) {
        writeDemoList(DEMO_EVENTS_KEY, demoCreated().map((e) => (e.id === master.id ? { ...e, recurrence: { ...e.recurrence!, rule: formatRule(truncated) } } : e)), 100)
      } else {
        await updateMaster(master.id, { rrule: formatRule(truncated), occurs_until: seriesEnd(series) })
        pushCalendarSync(master.id, 'upsert')
      }
      const newId = await createEvent(input, { seriesParentId: master.id })
      const next = newId ? await getMaster(newId) : null
      if (next) {
        for (const ex of future) {
          if (!findOccurrence(next, ex.occurrence)) continue // horaire ou règle changés : l'exception ne s'applique plus
          await upsertException(next, ex.occurrence, {
            deleted: ex.deleted,
            start_at: ex.start ?? null,
            end_at: ex.end ?? null,
            titre: ex.title ?? null,
            lieu: ex.location ?? null,
            description: ex.description ?? null,
            status: ex.status ?? null,
          })
        }
      }
      await dropExceptions(master.id, occ.occurrence)
      return newId ?? master.id
    }
  }

  // Série entière ou événement ponctuel.
  if (!LIVE) {
    if (demoEvent(masterId)?.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    const list = demoCreated()
    const prev = list.find((e) => e.id === masterId)
    if (prev) {
      const next = demoFromInput(masterId, input, prev.createdAt ?? new Date().toISOString())
      if (scheduleChanged(prev, toRow(input))) await dropExceptions(masterId)
      writeDemoList(DEMO_EVENTS_KEY, list.map((e) => (e.id === masterId ? next : e)), 100)
    }
    return masterId
  }
  const row = toRow(await withHealthChild(input))
  await updateMaster(masterId, row)
  if (master.recurrence && scheduleChanged(master, row)) await dropExceptions(masterId)
  pushCalendarSync(masterId, 'upsert')
  kickNotifications()
  return masterId
}

/**
 * Supprime un événement : ponctuel ou série entière ('all') ; occurrence seule ('one', les autres restent) ;
 * occurrence et suivantes ('following', la série s'arrête la veille ; dès la première : toute la série).
 */
export async function removeEvent(id: string, scope: SeriesScope = 'all'): Promise<void> {
  const occ = parseOccurrenceId(id)
  const masterId = occ?.seriesId ?? id
  if (occ && scope !== 'all') {
    const master = await getMaster(masterId)
    if (!master?.recurrence) throw new DataError(dataMsg('calendar.occurrenceNotFound'), 'invalid')
    if (master.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    if (scope === 'one') {
      await upsertException(master, occ.occurrence, { deleted: true })
      if (LIVE) { pushCalendarSync(masterId, 'upsert'); kickNotifications() }
      return
    }
    const rule = parseRule(master.recurrence.rule)
    if (rule && !isFirstOccurrence(master, occ.occurrence)) {
      const truncated = truncateBefore(rule, occ.occurrence)
      if (!LIVE) {
        writeDemoList(DEMO_EVENTS_KEY, demoCreated().map((e) => (e.id === masterId ? { ...e, recurrence: { ...e.recurrence!, rule: formatRule(truncated) } } : e)), 100)
      } else {
        await updateMaster(masterId, { rrule: formatRule(truncated), occurs_until: seriesEnd({ start: master.start, end: master.end, tz: master.recurrence.tz, rule: truncated }) })
        pushCalendarSync(masterId, 'upsert')
        kickNotifications()
      }
      await dropExceptions(masterId, occ.occurrence)
      return
    }
  }
  if (!LIVE) {
    if (demoEvent(masterId)?.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    writeDemoList(DEMO_EVENTS_KEY, demoCreated().filter((e) => e.id !== masterId), 100)
    await dropExceptions(masterId)
    return
  }
  const userId = await requireUserId()
  const { data, error } = await db()
    .from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', masterId).eq('user_id', userId).select('id')
  if (error) throw toDataError(error, 'calendar.remove')
  if (!data || data.length === 0) throw new DataError(NOT_AUTHOR(), 'not_author')
  pushCalendarSync(masterId, 'delete')
  kickNotifications()
}

/** Statut d'un événement ponctuel, ou d'une seule occurrence d'une série. */
export async function setEventStatus(id: string, status: EventStatus): Promise<void> {
  if (!EVENT_STATUSES.includes(status)) throw new DataError(dataMsg('errors.invalid'), 'invalid')
  const occ = parseOccurrenceId(id)
  if (occ) {
    const master = await getMaster(occ.seriesId)
    if (!master?.recurrence) throw new DataError(dataMsg('calendar.occurrenceNotFound'), 'invalid')
    await upsertException(master, occ.occurrence, { status })
    return
  }
  if (!LIVE) {
    if (demoEvent(id)?.sharedBy) throw new DataError(NOT_AUTHOR(), 'not_author')
    writeDemoList(DEMO_EVENTS_KEY, demoCreated().map((e) => (e.id === id ? { ...e, status } : e)), 100)
    return
  }
  await updateMaster(id, { status })
}

// --- Hooks ------------------------------------------------------------------

export function useEvents() {
  return useAsyncData<CalendarEvent[]>(listEvents, 'calendar', LIVE ? undefined : DEMO_LIST)
}

export function useEvent(id: string | null) {
  return useAsyncData<CalendarEvent | null>(
    () => (id ? getEvent(id) : Promise.resolve(null)),
    `event:${id ?? ''}`,
    // Démo : un événement créé pendant la session n'est lu qu'après montage → « chargement » d'abord.
    LIVE ? undefined : id ? (demoEvent(id) ?? undefined) : null,
  )
}
