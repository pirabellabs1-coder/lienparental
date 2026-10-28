/**
 * Abonnements Web Push de l'utilisateur connecté (public.push_subscriptions, 0440).
 *
 * GET    → { configured, publicKey, devices: [{ id, label, createdAt, endpointHash }] }
 *          publicKey : clé VAPID PUBLIQUE (réabonnement par le service worker, pushsubscriptionchange).
 *          endpointHash = sha256(endpoint) en hexadécimal, 16 premiers caractères :
 *          le navigateur reconnaît « cet appareil » sans que l'adresse ne circule.
 * POST   { endpoint, keys: { p256dh, auth } } → enregistre CE navigateur. Si l'adresse
 *          appartenait à un autre compte (appareil partagé), elle lui est retirée :
 *          un navigateur ne reçoit que les notifications du dernier compte qui l'a activé.
 * DELETE { endpoint } | { id } → retire un appareil (RLS : ses propres lignes).
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { requireAuthedUser } from '@/lib/auth/guard'
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
    const tc = await getTranslations('server.common')
    return { error: jsonError(status, ctx.reason, tc(`denied.${ctx.reason}`)) }
  }
  return { ctx, db: ctx.supabase as unknown as SupabaseClient }
}

async function readBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export async function GET() {
  const a = await authed()
  if ('error' in a) return a.error
  const t = await getTranslations('server.push')
  const { data, error } = await a.db
    .from('push_subscriptions')
    .select('id, endpoint, device_label, created_at')
    .order('created_at', { ascending: false })
  if (error) return jsonError(500, 'read_failed', t('readFailed'))
  const devices = ((data ?? []) as { id: string; endpoint: string; device_label: string | null; created_at: string }[])
    .map(d => ({ id: d.id, label: d.device_label ?? t('deviceFallback'), createdAt: d.created_at, endpointHash: endpointHash(d.endpoint) }))
  return jsonOk({ configured: pushConfigured(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '', devices })
}

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const a = await authed()
  if ('error' in a) return a.error
  const t = await getTranslations('server.push')
  if (!pushConfigured()) return jsonError(503, 'push_not_configured', t('notConfigured'))
  const rl = await rateLimit(userKey('push-subscribe', a.ctx.user.id), 20, 60 * 60_000)
  if (!rl.ok) return rateLimitedResponse(rl)

  const parsed = subscriptionSchema.safeParse(await readBody(req))
  if (!parsed.success) return jsonError(422, 'invalid_subscription', parsed.error.issues[0]?.message ?? t('invalidSubscription'))

  const admin = serviceDb()
  if (!admin) return jsonError(503, 'service_unavailable', t('serviceUnavailable'))

  const { count } = await a.db.from('push_subscriptions').select('id', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_DEVICES) {
    const { data: same } = await a.db.from('push_subscriptions').select('id').eq('endpoint', parsed.data.endpoint).maybeSingle()
    if (!same) return jsonError(409, 'too_many_devices', t('tooManyDevices', { max: MAX_DEVICES }))
  }

  // Adresse déjà rattachée à un AUTRE compte : on ne la réattribue que si c'est le même navigateur
  // (mêmes clés de chiffrement, cas d'un appareil partagé où l'on change de compte). Sinon refus :
  // connaître l'adresse d'un appareil ne doit pas suffire à détourner ses notifications.
  const { data: existing } = await admin.from('push_subscriptions')
    .select('user_id, p256dh, auth_secret').eq('endpoint', parsed.data.endpoint).maybeSingle()
  if (existing && existing.user_id !== a.ctx.user.id
    && (existing.p256dh !== parsed.data.keys.p256dh || existing.auth_secret !== parsed.data.keys.auth)) {
    return jsonError(409, 'subscription_conflict', t('invalidSubscription'))
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
  if (error) return jsonError(500, 'save_failed', t('saveFailed'))
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
  const t = await getTranslations('server.push')
  const parsed = deleteSchema.safeParse(await readBody(req))
  if (!parsed.success) return jsonError(422, 'invalid_body', t('invalidRequest'))
  const q = a.db.from('push_subscriptions').delete()
  const { error } = 'id' in parsed.data
    ? await q.eq('id', parsed.data.id).eq('user_id', a.ctx.user.id)
    : await q.eq('endpoint', parsed.data.endpoint).eq('user_id', a.ctx.user.id)
  if (error) return jsonError(500, 'delete_failed', t('deleteFailed'))
  return jsonOk({ ok: true })
}
