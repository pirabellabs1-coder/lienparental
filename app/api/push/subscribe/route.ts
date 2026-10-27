/**
 * Abonnements Web Push de l'utilisateur connecté (public.push_subscriptions, 0440).
 *
 * GET    → { configured, devices: [{ id, label, createdAt, endpointHash }] }
 *          endpointHash = sha256(endpoint) en hexadécimal, 16 premiers caractères :
 *          le navigateur reconnaît « cet appareil » sans que l'adresse ne circule.
 * POST   { endpoint, keys: { p256dh, auth } } → enregistre CE navigateur. Si l'adresse
 *          appartenait à un autre compte (appareil partagé), elle lui est retirée :
 *          un navigateur ne reçoit que les notifications du dernier compte qui l'a activé.
 * DELETE { endpoint } | { id } → retire un appareil (RLS : ses propres lignes).
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { parseUserAgent } from '@/lib/notify/device'
import { pushConfigured } from '@/lib/notify/push'
import { serviceDb } from '@/lib/notify/server'
import { subscriptionSchema } from '@/lib/notify/subscription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_DEVICES = 10

const endpointHash = (e: string) => createHash('sha256').update(e).digest('hex').slice(0, 16)

async function authed() {
  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    const status = ctx.reason === 'disabled' ? 501 : ctx.reason === 'mfa_required' ? 403 : 401
    return { error: jsonError(status, ctx.reason, DENIED_MESSAGES[ctx.reason]) }
  }
  return { ctx, db: ctx.supabase as unknown as SupabaseClient }
}

async function readBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export async function GET() {
  const a = await authed()
  if ('error' in a) return a.error
  const { data, error } = await a.db
    .from('push_subscriptions')
    .select('id, endpoint, device_label, created_at')
    .order('created_at', { ascending: false })
  if (error) return jsonError(500, 'read_failed', 'Impossible de charger vos appareils.')
  const devices = ((data ?? []) as { id: string; endpoint: string; device_label: string | null; created_at: string }[])
    .map(d => ({ id: d.id, label: d.device_label ?? 'Appareil', createdAt: d.created_at, endpointHash: endpointHash(d.endpoint) }))
  return jsonOk({ configured: pushConfigured(), devices })
}

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const a = await authed()
  if ('error' in a) return a.error
  if (!pushConfigured()) return jsonError(503, 'push_not_configured', 'Les notifications sur appareil ne sont pas encore disponibles.')
  const rl = await rateLimit(userKey('push-subscribe', a.ctx.user.id), 20, 60 * 60_000)
  if (!rl.ok) return rateLimitedResponse(rl)

  const parsed = subscriptionSchema.safeParse(await readBody(req))
  if (!parsed.success) return jsonError(422, 'invalid_subscription', parsed.error.issues[0]?.message ?? 'Abonnement invalide.')

  const admin = serviceDb()
  if (!admin) return jsonError(503, 'service_unavailable', 'Service momentanément indisponible.')

  const { count } = await a.db.from('push_subscriptions').select('id', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_DEVICES) {
    const { data: same } = await a.db.from('push_subscriptions').select('id').eq('endpoint', parsed.data.endpoint).maybeSingle()
    if (!same) return jsonError(409, 'too_many_devices', `Vous pouvez activer les notifications sur ${MAX_DEVICES} appareils au plus. Retirez-en un d’abord.`)
  }

  const label = parseUserAgent(req.headers.get('user-agent')).label
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: a.ctx.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth_secret: parsed.data.keys.auth,
      device_label: label,
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return jsonError(500, 'save_failed', 'Activation impossible pour le moment. Réessayez dans un instant.')
  return jsonOk({ ok: true, endpointHash: endpointHash(parsed.data.endpoint) })
}

const deleteSchema = z.union([
  z.object({ endpoint: z.string().min(1).max(1024) }).strict(),
  z.object({ id: z.string().uuid() }).strict(),
])

export async function DELETE(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const a = await authed()
  if ('error' in a) return a.error
  const parsed = deleteSchema.safeParse(await readBody(req))
  if (!parsed.success) return jsonError(422, 'invalid_body', 'Requête invalide.')
  const q = a.db.from('push_subscriptions').delete()
  const { error } = 'id' in parsed.data
    ? await q.eq('id', parsed.data.id).eq('user_id', a.ctx.user.id)
    : await q.eq('endpoint', parsed.data.endpoint).eq('user_id', a.ctx.user.id)
  if (error) return jsonError(500, 'delete_failed', 'Suppression impossible pour le moment.')
  return jsonOk({ ok: true })
}
