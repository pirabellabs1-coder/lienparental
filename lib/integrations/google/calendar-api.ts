import 'server-only'
/**
 * Client minimal de l'API REST Google Calendar v3 (fetch, sans SDK).
 * Chaque appel a un délai maximal ; les erreurs sont classées pour décider
 * entre rafraîchir le jeton, réessayer plus tard ou abandonner.
 */
const BASE = 'https://www.googleapis.com/calendar/v3'
const TIMEOUT_MS = 10_000

export type ErrorClass = 'auth' | 'scope' | 'rate' | 'server' | 'network' | 'not_found' | 'conflict' | 'invalid' | 'forbidden'

export type GResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; cls: ErrorClass; reason: string }

function classify(status: number, reason: string): ErrorClass {
  if (status === 0) return 'network'
  if (status === 401) return 'auth'
  if (status === 404 || status === 410) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate'
  if (status >= 500) return 'server'
  if (status === 403) {
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/i.test(reason)) return 'rate'
    if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(reason)) return 'scope'
    return 'forbidden'
  }
  return 'invalid'
}

export async function gcal<T = unknown>(token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<GResult<T>> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 0, cls: 'network', reason: 'network' }
  }
  if (res.ok) {
    const data = (res.status === 204 ? null : await res.json().catch(() => null)) as T
    return { ok: true, status: res.status, data }
  }
  const err = (await res.json().catch(() => null)) as { error?: { status?: string; errors?: { reason?: string }[] } } | null
  const reason = String(err?.error?.errors?.[0]?.reason ?? err?.error?.status ?? res.status).slice(0, 64)
  return { ok: false, status: res.status, cls: classify(res.status, reason), reason }
}

export const enc = encodeURIComponent

export type GoogleEventBody = {
  id?: string
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  /** RRULE / EXDATE (RFC 5545) d'une série. */
  recurrence?: string[]
  reminders: { useDefault: boolean; overrides?: { method: 'popup'; minutes: number }[] }
  extendedProperties: { private: Record<string, string> }
  source?: { title: string; url: string }
  visibility: 'default' | 'private'
  status: 'confirmed'
}

export type GoogleEvent = { id: string; etag?: string }
export type GoogleCalendar = { id: string; summary?: string }
