import 'server-only'
/**
 * Envoi Web Push (VAPID) aux abonnements d'un utilisateur (public.push_subscriptions).
 *
 * Variables : NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * (mailto:contact@lienparental.fr). Absentes : push désactivé (no-op journalisé).
 * Abonnement expiré (404 / 410) : supprimé. Les autres erreurs incrémentent
 * failure_count ; au-delà de 10 échecs consécutifs, l'abonnement est retiré.
 */
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PushMessage } from './core'

export function pushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
}

let configured = false
function configure(): boolean {
  if (configured) return true
  if (!pushConfigured()) return false
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    configured = true
    return true
  } catch {
    console.warn('[push] clés VAPID invalides : push désactivé')
    return false
  }
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth_secret: string; failure_count: number }

const MAX_FAILURES = 10

/** Envoie à tous les appareils de l'utilisateur. Renvoie le nombre d'appareils atteints. */
export async function sendPushToUser(admin: SupabaseClient, userId: string, msg: PushMessage): Promise<number> {
  if (!configure()) {
    console.info('[push] désactivé (clés VAPID absentes) : non envoyé')
    return 0
  }
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, failure_count')
    .eq('user_id', userId)
    .limit(20)
  if (error) throw new Error(`push_read_${error.code ?? 'error'}`)
  const subs = (data ?? []) as SubRow[]
  if (subs.length === 0) return 0

  // Charge minimale : pas de contenu sensible (voir lib/notify/content.ts).
  const body = JSON.stringify({ title: msg.title.slice(0, 120), body: msg.body.slice(0, 240), url: msg.url, tag: msg.tag.slice(0, 64) })
  let sent = 0
  let transient = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
        body,
        { TTL: 60 * 60 * 24, urgency: 'normal', timeout: 8_000 },
      )
      sent++
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410 || s.failure_count + 1 >= MAX_FAILURES) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        transient++
        await admin.from('push_subscriptions').update({ failure_count: s.failure_count + 1 }).eq('id', s.id)
      }
    }
  }))
  // Tous les appareils en échec temporaire : réessai plus tard.
  if (sent === 0 && transient > 0) throw new Error('push_transient')
  return sent
}
