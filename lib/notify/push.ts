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
import { pushFailureAction, pushShouldRetry, type PushReport } from './push-report'

export type { PushReport } from './push-report'

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

/** Message push ; `lang` (facultatif) : langue de la notification affichée par le SW. */
export type PushPayload = PushMessage & { lang?: 'fr' | 'en' | 'pt' }

/**
 * Envoie à tous les appareils de l'utilisateur et renvoie le bilan détaillé.
 * Abonnement expiré (404 / 410) ou trop d'échecs consécutifs : supprimé (compté dans `expired`).
 * `configured: false` : clés VAPID absentes, rien n'est tenté.
 */
export async function sendPushToUserDetailed(admin: SupabaseClient, userId: string, msg: PushPayload): Promise<PushReport & { configured: boolean }> {
  if (!configure()) {
    console.info('[push] désactivé (clés VAPID absentes) : non envoyé')
    return { configured: false, total: 0, sent: 0, expired: 0, failed: 0 }
  }
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, failure_count')
    .eq('user_id', userId)
    .limit(20)
  if (error) throw new Error(`push_read_${error.code ?? 'error'}`)
  const subs = (data ?? []) as SubRow[]
  const report = { configured: true, total: subs.length, sent: 0, expired: 0, failed: 0 }
  if (subs.length === 0) return report

  // Charge minimale : pas de contenu sensible (voir lib/notify/content.ts).
  const body = JSON.stringify({
    title: msg.title.slice(0, 120), body: msg.body.slice(0, 240), url: msg.url, tag: msg.tag.slice(0, 64),
    ...(msg.lang ? { lang: msg.lang } : {}),
  })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
        body,
        { TTL: 60 * 60 * 24, urgency: 'normal', timeout: 8_000 },
      )
      report.sent++
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id)
    } catch (e) {
      if (pushFailureAction((e as { statusCode?: number }).statusCode, s.failure_count) === 'delete') {
        report.expired++
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        report.failed++
        await admin.from('push_subscriptions').update({ failure_count: s.failure_count + 1 }).eq('id', s.id)
      }
    }
  }))
  return report
}

/** Envoie à tous les appareils de l'utilisateur. Renvoie le nombre d'appareils atteints. */
export async function sendPushToUser(admin: SupabaseClient, userId: string, msg: PushPayload): Promise<number> {
  const r = await sendPushToUserDetailed(admin, userId, msg)
  // Tous les appareils en échec temporaire : réessai plus tard.
  if (pushShouldRetry(r)) throw new Error('push_transient')
  return r.sent
}
