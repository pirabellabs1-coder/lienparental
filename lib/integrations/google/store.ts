import 'server-only'
/**
 * Accès BDD de l'intégration Google (service_role, contourne la RLS).
 * RÈGLE : chaque fonction prend `userId` issu de requireAuthedUser() et
 * filtre dessus ; aucune requête sans `user_id`. Les jetons ne sortent
 * jamais de ce module et de sync.ts / routes serveur.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { isSealedPayload, type SealedPayload } from './crypto'
import { DB_EVENT_TYPES, type CalendarTarget, type ConnectionStatus, type DbEventType, type MaskMode } from './types'

export type ConnectionRow = {
  user_id: string
  status: ConnectionStatus
  google_sub: string | null
  google_email: string | null
  scopes: string
  refresh_token_enc: SealedPayload | null
  access_token_enc: SealedPayload | null
  access_token_expires_at: string | null
  target: CalendarTarget
  calendar_id: string | null
  sync_types: DbEventType[]
  mask_mode: MaskMode
  connected_at: string | null
  last_sync_at: string | null
  last_error_code: string | null
}

export type LinkRow = { external_calendar_id: string; external_event_id: string; etag: string | null }
export type JobRow = { id: string; event_id: string; op: 'upsert' | 'delete'; attempts: number; enqueued_at: string }

const CONN_COLUMNS = 'user_id, status, google_sub, google_email, scopes, refresh_token_enc, access_token_enc, access_token_expires_at, target, calendar_id, sync_types, mask_mode, connected_at, last_sync_at, last_error_code'

/** Tables 0320 absentes de lib/supabase/types.ts : client non typé. */
export function admin(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

export class StoreError extends Error {
  constructor(op: string, code?: string) {
    super(`google store ${op} failed (${code ?? 'unknown'})`)
    this.name = 'StoreError'
  }
}

function fail(op: string, error: { code?: string } | null): never {
  console.warn(`[google] ${op} a échoué (code ${error?.code ?? 'unknown'})`)
  throw new StoreError(op, error?.code)
}

function normalize(row: Record<string, unknown>): ConnectionRow {
  const r = row as unknown as ConnectionRow
  return {
    ...r,
    refresh_token_enc: isSealedPayload(r.refresh_token_enc) ? r.refresh_token_enc : null,
    access_token_enc: isSealedPayload(r.access_token_enc) ? r.access_token_enc : null,
    sync_types: (Array.isArray(r.sync_types) ? r.sync_types : []).filter((t): t is DbEventType => (DB_EVENT_TYPES as readonly string[]).includes(t)),
  }
}

export async function getConnection(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await admin().from('google_connections').select(CONN_COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) fail('getConnection', error)
  return data ? normalize(data as Record<string, unknown>) : null
}

export async function upsertConnection(userId: string, patch: Partial<Omit<ConnectionRow, 'user_id'>>): Promise<void> {
  const { error } = await admin().from('google_connections').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
  if (error) fail('upsertConnection', error)
}

export async function updateConnection(userId: string, patch: Partial<Omit<ConnectionRow, 'user_id'>>): Promise<void> {
  const { error } = await admin().from('google_connections').update(patch).eq('user_id', userId)
  if (error) fail('updateConnection', error)
}

/** Jeton refusé par Google : on efface les jetons et on demande une reconnexion. */
export async function markReauthRequired(userId: string, code: string): Promise<void> {
  await updateConnection(userId, {
    status: 'reauth_required', refresh_token_enc: null, access_token_enc: null, access_token_expires_at: null, last_error_code: code,
  })
}

// --- Liens événement ↔ Google ---------------------------------------------

export async function getLink(userId: string, eventId: string): Promise<LinkRow | null> {
  const { data, error } = await admin().from('calendar_event_links')
    .select('external_calendar_id, external_event_id, etag')
    .eq('user_id', userId).eq('event_id', eventId).eq('provider', 'google').maybeSingle()
  if (error) fail('getLink', error)
  return (data as LinkRow | null) ?? null
}

export async function saveLink(userId: string, eventId: string, link: LinkRow): Promise<void> {
  const { error } = await admin().from('calendar_event_links').upsert(
    { user_id: userId, event_id: eventId, provider: 'google', ...link, synced_at: new Date().toISOString() },
    { onConflict: 'user_id,event_id,provider' },
  )
  if (error) fail('saveLink', error)
}

export async function deleteLink(userId: string, eventId: string): Promise<void> {
  const { error } = await admin().from('calendar_event_links').delete().eq('user_id', userId).eq('event_id', eventId).eq('provider', 'google')
  if (error) fail('deleteLink', error)
}

export async function deleteAllLinks(userId: string): Promise<void> {
  const { error } = await admin().from('calendar_event_links').delete().eq('user_id', userId).eq('provider', 'google')
  if (error) fail('deleteAllLinks', error)
}

// --- File de réessai -------------------------------------------------------

export async function enqueue(userId: string, eventIds: string[], op: 'upsert' | 'delete' = 'upsert', delayMs = 0): Promise<void> {
  if (eventIds.length === 0) return
  const now = new Date()
  const rows = eventIds.map((event_id) => ({
    user_id: userId, event_id, op, status: 'pending', attempts: 0, last_error_code: null,
    next_attempt_at: new Date(now.getTime() + delayMs).toISOString(), enqueued_at: now.toISOString(),
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin().from('google_sync_queue').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,event_id' })
    if (error) fail('enqueue', error)
  }
}

export async function claimJobs(userId: string, limit: number): Promise<JobRow[]> {
  const { data, error } = await admin().rpc('claim_google_sync_jobs', { p_user_id: userId, p_limit: limit })
  if (error) fail('claimJobs', error)
  return (data ?? []) as JobRow[]
}

/** Supprime la tâche si elle n'a pas été ré-enfilée entre-temps (enqueued_at = version). */
export async function completeJob(userId: string, job: Pick<JobRow, 'id' | 'enqueued_at'>): Promise<void> {
  const { error } = await admin().from('google_sync_queue').delete().eq('user_id', userId).eq('id', job.id).eq('enqueued_at', job.enqueued_at)
  if (error) fail('completeJob', error)
}

export async function deleteJobForEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await admin().from('google_sync_queue').delete().eq('user_id', userId).eq('event_id', eventId)
  if (error) fail('deleteJobForEvent', error)
}

export const MAX_ATTEMPTS = 8

/** Échec temporaire : nouvel essai avec attente exponentielle (1, 2, 4… min, max 6 h, ±20 %). */
export async function retryJob(userId: string, job: JobRow, code: string): Promise<void> {
  const attempts = job.attempts + 1
  const base = Math.min(2 ** (attempts - 1) * 60_000, 6 * 3_600_000)
  const delay = Math.round(base * (0.8 + Math.random() * 0.4))
  const { error } = await admin().from('google_sync_queue')
    .update({
      attempts,
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      next_attempt_at: new Date(Date.now() + delay).toISOString(),
      last_error_code: code.slice(0, 64),
    })
    .eq('user_id', userId).eq('id', job.id).eq('enqueued_at', job.enqueued_at)
  if (error) fail('retryJob', error)
}

export async function failJob(userId: string, job: JobRow, code: string): Promise<void> {
  const { error } = await admin().from('google_sync_queue')
    .update({ status: 'failed', attempts: job.attempts + 1, last_error_code: code.slice(0, 64) })
    .eq('user_id', userId).eq('id', job.id).eq('enqueued_at', job.enqueued_at)
  if (error) fail('failJob', error)
}

export async function clearQueue(userId: string): Promise<void> {
  const { error } = await admin().from('google_sync_queue').delete().eq('user_id', userId)
  if (error) fail('clearQueue', error)
}

export async function queueCounts(userId: string): Promise<{ pending: number; failed: number }> {
  const db = admin()
  const [p, f] = await Promise.all([
    db.from('google_sync_queue').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
    db.from('google_sync_queue').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'failed'),
  ])
  if (p.error) fail('queueCounts', p.error)
  if (f.error) fail('queueCounts', f.error)
  return { pending: p.count ?? 0, failed: f.count ?? 0 }
}
