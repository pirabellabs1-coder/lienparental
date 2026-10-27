/**
 * Validation d'un abonnement Web Push envoyé par le navigateur. Module PUR.
 * Seuls les services de push des navigateurs sont acceptés (même liste que la
 * contrainte SQL de public.push_subscriptions, 0440) : le serveur ne contacte
 * jamais un hôte arbitraire (pas de SSRF).
 */
import { z } from 'zod'

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^[a-z0-9.-]+\.push\.apple\.com$/,
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false
    return PUSH_HOSTS.some(re => re.test(u.hostname))
  } catch {
    return false
  }
}

const b64url = (min: number, max: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`))

export const subscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isAllowedPushEndpoint, 'Service de notification non pris en charge.'),
  keys: z.object({ p256dh: b64url(40, 200), auth: b64url(10, 100) }),
})

export type PushSubscriptionInput = z.infer<typeof subscriptionSchema>
