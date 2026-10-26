/**
 * POST /api/integrations/google/calendar/sync
 *   { eventId, op }        : répercute un événement créé / modifié / supprimé (appelé par lib/data/calendar.ts).
 *   { action: 'process' }  : traite un lot de la file de réessai.
 *   { action: 'resync' }   : renvoie tous les événements à venir, puis traite un premier lot.
 *
 * Le serveur relit l'événement en base via le client RLS de l'utilisateur ET avec un
 * filtre explicite `user_id = <appelant>` (readEvent, lib/integrations/google/sync.ts) :
 * la RLS seule ne suffit pas, car depuis 0340 elle laisse lire les événements partagés
 * par un autre parent lié. Un événement dont l'appelant n'est pas l'auteur est donc
 * traité comme introuvable (jamais recopié dans son agenda Google).
 * Réponses : 200 { status } ; 202 si mis en file ; 401 / 403 / 409 / 429.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { googleCalendarConfigured } from '@/lib/integrations/google/config'
import { crossSite, guard, sameOrigin } from '@/lib/integrations/google/http'
import { enqueueUpcoming, processQueue, syncEvent } from '@/lib/integrations/google/sync'
import type { SyncResponse } from '@/lib/integrations/google/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.union([
  z.object({ eventId: z.string().uuid(), op: z.enum(['upsert', 'delete']).default('upsert') }).strict(),
  z.object({ action: z.enum(['process', 'resync']) }).strict(),
])

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return crossSite()
  const ctx = await guard()
  if (ctx.kind === 'denied') return ctx.response
  // Démo / intégration non configurée : rien à faire, réponse neutre (le client cesse d'appeler).
  if (ctx.kind === 'demo' || !googleCalendarConfigured()) return jsonOk<SyncResponse>({ status: 'not_connected' })

  if (Number(req.headers.get('content-length') ?? 0) > 1024) return jsonError(413, 'payload_too_large', 'Requête trop volumineuse.')
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'invalid_payload', 'Requête invalide.')
  const userId = ctx.user.id

  try {
    if ('eventId' in parsed.data) {
      const limited = await rateLimit(userKey('gcal:sync', userId), 120, 60_000)
      if (!limited.ok) return jsonError(429, 'rate_limited', 'Trop de synchronisations.', { 'Retry-After': String(limited.retryAfter) })
      const status = await syncEvent(userId, ctx.db, parsed.data.eventId, parsed.data.op)
      // Profite de l'appel pour écouler quelques réessais échus.
      if (status === 'synced' || status === 'removed' || status === 'skipped') await processQueue(userId, ctx.db, 3).catch(() => undefined)
      return jsonOk<SyncResponse>({ status }, status === 'queued' ? 202 : 200)
    }

    const limited = await rateLimit(userKey('gcal:batch', userId), parsed.data.action === 'resync' ? 5 : 60, 10 * 60_000)
    if (!limited.ok) return jsonError(429, 'rate_limited', 'Trop de demandes. Réessayez dans quelques minutes.', { 'Retry-After': String(limited.retryAfter) })
    if (parsed.data.action === 'resync') await enqueueUpcoming(userId, ctx.db)
    const r = await processQueue(userId, ctx.db, 10)
    return jsonOk<SyncResponse>({ status: 'processed', ...r })
  } catch {
    return jsonError(500, 'sync_failed', 'La synchronisation a échoué. Elle sera retentée.')
  }
}
