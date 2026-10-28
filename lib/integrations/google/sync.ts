import 'server-only'
/**
 * Moteur de synchronisation sortante Lien Parental → Google Agenda.
 *
 * Principe : RÉCONCILIATION. Pour un événement donné, on relit son état
 * courant en base (client RLS de l'utilisateur, jamais le contenu envoyé
 * par le navigateur) puis on rend Google conforme :
 *   - présent, non supprimé, type envoyé → créé ou mis à jour ;
 *   - supprimé, introuvable ou type exclu → retiré de Google s'il y était.
 * L'ordre d'arrivée des requêtes importe donc peu, et rejouer est sans effet.
 *
 * Idempotence de création : l'identifiant Google est DÉTERMINISTE
 * (« lp » + uuid sans tirets, alphabet base32hex accepté par l'API) ; une
 * création rejouée renvoie 409 et devient une mise à jour, jamais un doublon.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TZ } from '@/lib/tz'
import { enc, gcal, type GResult, type GoogleCalendar, type GoogleEvent, type GoogleEventBody } from './calendar-api'
import { googleOAuthConfig } from './config'
import { openToken, sealToken } from './crypto'
import { refreshAccessToken, revokeToken } from './oauth'
import * as store from './store'
import { toGoogleEvent, type EventRow } from './event-body'
import { tzFromPreferencesRow } from '@/lib/timezones'


export type SyncOutcome = 'synced' | 'removed' | 'skipped' | 'queued' | 'not_connected' | 'reauth_required' | 'failed'

/** Accès refusé durablement (jeton révoqué, portée retirée) → reconnexion nécessaire. */
class ReauthError extends Error { constructor(readonly code: string) { super(code) } }
/** Panne passagère (réseau, quota, 5xx) → file de réessai. */
class TransientError extends Error { constructor(readonly code: string) { super(code) } }
/** Requête refusée pour de bon (400…) → abandon, code mémorisé. */
class PermanentError extends Error { constructor(readonly code: string) { super(code) } }

export const googleEventId = (eventId: string) => `lp${eventId.replace(/-/g, '').toLowerCase()}`

function raise(r: Extract<GResult<unknown>, { ok: false }>): never {
  const code = `${r.cls}:${r.reason}`.slice(0, 64)
  if (r.cls === 'auth' || r.cls === 'scope') throw new ReauthError(code)
  if (r.cls === 'rate' || r.cls === 'server' || r.cls === 'network') throw new TransientError(code)
  throw new PermanentError(code)
}

/** Session d'appel : jeton d'accès en cache chiffré, rafraîchi à l'expiration ou sur 401 (une fois). */
class GoogleSession {
  private token: string | null = null
  /** @param tz Fuseau de l'utilisateur (preferences.ui.fuseau) : start/end.timeZone et agenda dédié. */
  constructor(readonly conn: store.ConnectionRow, readonly tz: string = DEFAULT_TZ) {}

  private async freshToken(force: boolean): Promise<string> {
    const c = this.conn
    const expires = c.access_token_expires_at ? Date.parse(c.access_token_expires_at) : 0
    if (!force && c.access_token_enc && expires - Date.now() > 60_000) {
      try { return openToken(c.user_id, 'access', c.access_token_enc) } catch { /* clé changée : on rafraîchit */ }
    }
    const cfg = googleOAuthConfig()
    if (!cfg) throw new TransientError('not_configured')
    if (!c.refresh_token_enc) throw new ReauthError('no_refresh_token')
    let refresh: string
    try { refresh = openToken(c.user_id, 'refresh', c.refresh_token_enc) } catch { throw new ReauthError('decrypt_failed') }
    const r = await refreshAccessToken(cfg, refresh)
    if (!r.ok) {
      if (r.kind === 'transient') throw new TransientError('refresh_unavailable')
      throw new ReauthError(r.kind === 'revoked' ? 'invalid_grant' : 'refresh_invalid')
    }
    const expiresAt = new Date(Date.now() + r.tokens.expires_in * 1000).toISOString()
    const sealed = sealToken(c.user_id, 'access', r.tokens.access_token)
    await store.updateConnection(c.user_id, { access_token_enc: sealed, access_token_expires_at: expiresAt })
    c.access_token_enc = sealed
    c.access_token_expires_at = expiresAt
    return r.tokens.access_token
  }

  async call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<GResult<T>> {
    this.token ??= await this.freshToken(false)
    let r = await gcal<T>(this.token, method, path, body)
    if (!r.ok && r.cls === 'auth') {
      this.token = await this.freshToken(true)
      r = await gcal<T>(this.token, method, path, body)
    }
    return r
  }

  /** Agenda cible ; crée l'agenda « Lien Parental » à la première utilisation. */
  async calendarId(): Promise<string> {
    if (this.conn.target === 'primary') return 'primary'
    if (this.conn.calendar_id) return this.conn.calendar_id
    const r = await this.call<GoogleCalendar>('POST', '/calendars', {
      summary: 'Lien Parental',
      description: 'Événements envoyés depuis l’application Lien Parental.',
      timeZone: this.tz,
    })
    if (!r.ok) raise(r)
    this.conn.calendar_id = r.data.id
    await store.updateConnection(this.conn.user_id, { calendar_id: r.data.id })
    return r.data.id
  }

  /** L'agenda dédié a été supprimé côté Google : on l'oubliera et le recréera. */
  async forgetCalendar(): Promise<void> {
    this.conn.calendar_id = null
    await store.updateConnection(this.conn.user_id, { calendar_id: null })
  }
}

// Filtre explicite sur le propriétaire : depuis 0340, la RLS laisse aussi lire les
// événements PARTAGÉS par un autre parent (calendar_select_family). Sans ce filtre,
// un événement d'autrui serait recopié dans l'agenda Google de l'appelant.
async function readEvent(userDb: SupabaseClient, userId: string, eventId: string): Promise<EventRow | null> {
  const { data, error } = await userDb.from('calendar_events')
    .select('id, type, titre, description, lieu, start_at, end_at, reminder_minutes, deleted_at')
    .eq('id', eventId).eq('user_id', userId).maybeSingle()
  if (error) throw new TransientError(`db:${error.code ?? 'read'}`)
  return (data as EventRow | null) ?? null
}

async function reconcile(s: GoogleSession, userDb: SupabaseClient, eventId: string): Promise<'synced' | 'removed' | 'skipped'> {
  const userId = s.conn.user_id
  const [ev, link] = await Promise.all([readEvent(userDb, userId, eventId), store.getLink(userId, eventId)])
  const wanted = Boolean(ev && !ev.deleted_at && s.conn.sync_types.includes(ev.type))

  if (!wanted || !ev) {
    if (!link) return 'skipped'
    const r = await s.call('DELETE', `/calendars/${enc(link.external_calendar_id)}/events/${enc(link.external_event_id)}`)
    if (!r.ok && r.cls !== 'not_found') raise(r)
    await store.deleteLink(userId, eventId)
    return 'removed'
  }

  const body = toGoogleEvent(ev, s.conn, s.tz)

  if (link) {
    const r = await s.call<GoogleEvent>('PUT', `/calendars/${enc(link.external_calendar_id)}/events/${enc(link.external_event_id)}`, body)
    if (r.ok) {
      await store.saveLink(userId, eventId, { ...link, etag: r.data?.etag ?? null })
      return 'synced'
    }
    if (r.cls !== 'not_found') raise(r)
    // Événement ou agenda supprimé côté Google : on recrée à la cible actuelle.
    await store.deleteLink(userId, eventId)
  }

  const gid = googleEventId(ev.id)
  for (let attempt = 0; attempt < 2; attempt++) {
    const calId = await s.calendarId()
    let r = await s.call<GoogleEvent>('POST', `/calendars/${enc(calId)}/events`, { ...body, id: gid })
    // Déjà créé (rejeu, ou reconnexion) : mise à jour au même identifiant.
    if (!r.ok && r.cls === 'conflict') r = await s.call<GoogleEvent>('PUT', `/calendars/${enc(calId)}/events/${enc(gid)}`, body)
    if (r.ok) {
      await store.saveLink(userId, eventId, { external_calendar_id: calId, external_event_id: r.data?.id ?? gid, etag: r.data?.etag ?? null })
      return 'synced'
    }
    if (r.cls === 'not_found' && s.conn.target === 'dedicated' && attempt === 0) {
      await s.forgetCalendar()
      continue
    }
    raise(r)
  }
  throw new PermanentError('calendar_unavailable')
}

async function activeSession(userId: string, userDb: SupabaseClient): Promise<GoogleSession | SyncOutcome> {
  const conn = await store.getConnection(userId)
  if (!conn || conn.status === 'disconnected') return 'not_connected'
  if (conn.status === 'reauth_required') return 'reauth_required'
  // Fuseau de l'utilisateur (repli DEFAULT_TZ si la préférence est illisible).
  const { data: prefs } = await userDb.from('preferences').select('ui').eq('user_id', userId).maybeSingle()
  return new GoogleSession(conn, tzFromPreferencesRow(prefs as { ui?: unknown } | null))
}

/** Synchronise un événement maintenant ; panne passagère → mis en file. */
export async function syncEvent(userId: string, userDb: SupabaseClient, eventId: string, op: 'upsert' | 'delete'): Promise<SyncOutcome> {
  const s = await activeSession(userId, userDb)
  if (typeof s === 'string') return s
  try {
    const out = await reconcile(s, userDb, eventId)
    await store.deleteJobForEvent(userId, eventId)
    await store.updateConnection(userId, { last_sync_at: new Date().toISOString(), last_error_code: null })
    return out
  } catch (e) {
    if (e instanceof ReauthError) {
      await store.markReauthRequired(userId, e.code)
      return 'reauth_required'
    }
    if (e instanceof TransientError) {
      await store.enqueue(userId, [eventId], op, 60_000)
      return 'queued'
    }
    if (e instanceof PermanentError) {
      await store.updateConnection(userId, { last_error_code: e.code })
      return 'failed'
    }
    throw e
  }
}

/** Traite les tâches dues de l'utilisateur (borné : quelques secondes par appel). */
export async function processQueue(userId: string, userDb: SupabaseClient, limit = 10): Promise<{ processed: number; remaining: number; reauthRequired: boolean }> {
  const s = await activeSession(userId, userDb)
  if (typeof s === 'string') {
    const { pending } = await store.queueCounts(userId)
    return { processed: 0, remaining: pending, reauthRequired: s === 'reauth_required' }
  }
  const jobs = await store.claimJobs(userId, limit)
  let processed = 0
  let reauthRequired = false
  let synced = false
  for (const job of jobs) {
    try {
      await reconcile(s, userDb, job.event_id)
      await store.completeJob(userId, job)
      synced = true
    } catch (e) {
      if (e instanceof ReauthError) {
        await store.markReauthRequired(userId, e.code)
        reauthRequired = true
        break
      }
      if (e instanceof TransientError) await store.retryJob(userId, job, e.code)
      else if (e instanceof PermanentError) await store.failJob(userId, job, e.code)
      else throw e
    }
    processed++
  }
  if (synced) await store.updateConnection(userId, { last_sync_at: new Date().toISOString(), last_error_code: null })
  const { pending } = await store.queueCounts(userId)
  return { processed, remaining: pending, reauthRequired }
}

/** Met en file les événements de la veille à +12 mois (connexion, changement de préférences, renvoi). */
export async function enqueueUpcoming(userId: string, userDb: SupabaseClient): Promise<number> {
  const from = new Date(Date.now() - 86_400_000).toISOString()
  const to = new Date(Date.now() + 366 * 86_400_000).toISOString()
  const { data, error } = await userDb.from('calendar_events').select('id')
    .eq('user_id', userId).gte('start_at', from).lt('start_at', to)
    .order('start_at', { ascending: true }).limit(500)
  if (error) throw new Error(`enqueueUpcoming: ${error.code ?? 'read'}`)
  // Inclut les événements supprimés récemment : leur copie Google sera retirée.
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  await store.enqueue(userId, ids, 'upsert')
  return ids.length
}

/** Déconnexion : révocation chez Google (au mieux), effacement des jetons, des liens et de la file. */
export async function disconnect(userId: string): Promise<{ revoked: boolean }> {
  const conn = await store.getConnection(userId)
  if (!conn) return { revoked: true }
  let revoked = true
  if (conn.refresh_token_enc) {
    try {
      revoked = await revokeToken(openToken(userId, 'refresh', conn.refresh_token_enc))
    } catch {
      revoked = false
    }
  }
  await store.clearQueue(userId)
  await store.deleteAllLinks(userId)
  // On garde google_sub + calendar_id (sans valeur secrète) : une reconnexion
  // au même compte réutilise l'agenda « Lien Parental » au lieu d'en créer un second.
  await store.updateConnection(userId, {
    status: 'disconnected', refresh_token_enc: null, access_token_enc: null, access_token_expires_at: null,
    google_email: null, scopes: '', last_error_code: revoked ? null : 'revoke_failed',
  })
  return { revoked }
}
