/**
 * /api/integrations/google/calendar
 *   GET    : état de la connexion Google Agenda de l'utilisateur (sans aucun jeton).
 *   PATCH  : préférences (types envoyés, masquage, agenda cible) → renvoi des événements à venir.
 *   DELETE : déconnexion (révocation chez Google + effacement des jetons).
 * 401 sans session, 403 si la double authentification n'est pas validée.
 */
import { getTranslations } from 'next-intl/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { googleCalendarConfigured, scopesAllow } from '@/lib/integrations/google/config'
import { crossSite, guard, sameOrigin } from '@/lib/integrations/google/http'
import * as store from '@/lib/integrations/google/store'
import { disconnect, enqueueUpcoming } from '@/lib/integrations/google/sync'
import { UI_EVENT_TYPES, dbToUiType, uiToDbType, type GoogleCalendarState } from '@/lib/integrations/google/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const t = await getTranslations('server.google')
  const ctx = await guard()
  if (ctx.kind === 'denied') return ctx.response
  if (ctx.kind === 'demo') return jsonOk<GoogleCalendarState>({ mode: 'demo', configured: false })
  if (!googleCalendarConfigured()) return jsonOk<GoogleCalendarState>({ mode: 'live', configured: false })

  try {
    const conn = await store.getConnection(ctx.user.id)
    if (!conn || conn.status === 'disconnected') {
      return jsonOk<GoogleCalendarState>({ mode: 'live', configured: true, connection: null })
    }
    const counts = await store.queueCounts(ctx.user.id)
    return jsonOk<GoogleCalendarState>({
      mode: 'live',
      configured: true,
      connection: {
        status: conn.status,
        googleEmail: conn.google_email,
        target: conn.target,
        calendarReady: conn.target === 'primary' || Boolean(conn.calendar_id),
        syncTypes: conn.sync_types.map(dbToUiType),
        maskMode: conn.mask_mode,
        connectedAt: conn.connected_at,
        lastSyncAt: conn.last_sync_at,
        lastErrorCode: conn.last_error_code,
        pending: counts.pending,
        failed: counts.failed,
        canUse: { dedicated: scopesAllow(conn.scopes, 'dedicated'), primary: scopesAllow(conn.scopes, 'primary') },
      },
    })
  } catch {
    return jsonError(500, 'status_failed', t('statusFailed'))
  }
}

const prefsSchema = z.object({
  syncTypes: z.array(z.enum(UI_EVENT_TYPES)).max(UI_EVENT_TYPES.length).optional(),
  maskMode: z.enum(['none', 'sensitive', 'all']).optional(),
  target: z.enum(['dedicated', 'primary']).optional(),
}).strict()

export async function PATCH(req: NextRequest) {
  const t = await getTranslations('server.google')
  if (!sameOrigin(req)) return crossSite()
  const ctx = await guard()
  if (ctx.kind === 'denied') return ctx.response
  if (ctx.kind === 'demo' || !googleCalendarConfigured()) return jsonError(409, 'not_configured', t('notConfigured'))

  const limited = await rateLimit(userKey('gcal:prefs', ctx.user.id), 20, 10 * 60_000)
  if (!limited.ok) return jsonError(429, 'rate_limited', t('tooManyChanges'), { 'Retry-After': String(limited.retryAfter) })
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return jsonError(413, 'payload_too_large', t('payloadTooLarge'))

  const parsed = prefsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid_payload', t('invalidPrefs'))

  try {
    const conn = await store.getConnection(ctx.user.id)
    if (!conn || conn.status !== 'active') return jsonError(409, 'not_connected', t('notConnected'))
    const { syncTypes, maskMode, target } = parsed.data
    // Changer d'agenda peut exiger une autorisation que Google n'a pas encore donnée.
    if (target && target !== conn.target && !scopesAllow(conn.scopes, target)) {
      return jsonError(409, 'reconnect_required', t('reconnectRequired'))
    }
    const patch: Partial<store.ConnectionRow> = {}
    if (syncTypes) patch.sync_types = [...new Set(syncTypes.map(uiToDbType))]
    if (maskMode) patch.mask_mode = maskMode
    if (target) patch.target = target
    if (Object.keys(patch).length === 0) return jsonOk({ ok: true, queued: 0 })
    await store.updateConnection(ctx.user.id, patch)
    // Réconciliation des événements à venir : ajout des types activés, retrait des types exclus, nouveau masquage.
    // (Les événements déjà poussés restent dans leur agenda d'origine ; seuls les nouveaux vont dans la nouvelle cible.)
    const queued = await enqueueUpcoming(ctx.user.id, ctx.db)
    return jsonOk({ ok: true, queued })
  } catch {
    return jsonError(500, 'prefs_failed', t('prefsFailed'))
  }
}

export async function DELETE(req: NextRequest) {
  const t = await getTranslations('server.google')
  if (!sameOrigin(req)) return crossSite()
  const ctx = await guard()
  if (ctx.kind === 'denied') return ctx.response
  if (ctx.kind === 'demo' || !googleCalendarConfigured()) return jsonError(409, 'not_configured', t('notConfigured'))

  try {
    const { revoked } = await disconnect(ctx.user.id)
    return jsonOk({ ok: true, revoked })
  } catch {
    return jsonError(500, 'disconnect_failed', t('disconnectFailed'))
  }
}
