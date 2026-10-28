/**
 * POST /api/push/test — « Envoyer une notification de test » (Préférences > Notifications).
 *
 * Utilisateur connecté uniquement, même origine (JSON), 3 essais / 10 min. Envoie une
 * notification push à TOUS ses appareils + une ligne in-app, textes dans la langue de
 * l'interface. Les abonnements expirés (404 / 410) sont supprimés au passage.
 *
 *   200 { status: 'sent' | 'no_devices' | 'expired' | 'failed' | 'not_configured', sent, expired, failed, inApp }
 *   401 / 403 / 501 (démo) · 415 / 403 (origine) · 429 (limite) · 503 (push ou service indisponible)
 * Ne renvoie jamais d'adresse d'abonnement ni de détail technique.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLocale, getTranslations } from 'next-intl/server'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { requireAuthedUser } from '@/lib/auth/guard'
import { pushConfigured, sendPushToUserDetailed } from '@/lib/notify/push'
import { serviceDb } from '@/lib/notify/server'
import { PUSH_TEST_HREF, PUSH_TEST_LIMIT, PUSH_TEST_WINDOW_MS, runPushTest } from '@/lib/notify/push-test'
import { toLocale } from '@/lib/email/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected

  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    const status = ctx.reason === 'disabled' ? 501 : ctx.reason === 'mfa_required' ? 403 : 401
    const tc = await getTranslations('server.common')
    return jsonError(status, ctx.reason, tc(`denied.${ctx.reason}`))
  }
  const userId = ctx.user.id
  const t = await getTranslations('account.push.test')

  const rl = await rateLimit(userKey('push-test', userId), PUSH_TEST_LIMIT, PUSH_TEST_WINDOW_MS, { failClosed: true })
  if (!rl.ok) return rateLimitedResponse(rl, t('result.rateLimited'))

  if (!pushConfigured()) return jsonError(503, 'push_not_configured', t('result.notConfigured'))
  const admin = serviceDb() as SupabaseClient | null
  if (!admin) return jsonError(503, 'service_unavailable', t('result.failed'))

  const lang = toLocale(await getLocale())
  const outcome = await runPushTest(
    {
      sendPush: (msg) => sendPushToUserDetailed(admin, userId, msg),
      async insertInApp(row) {
        const { error } = await admin.from('notifications').insert({
          user_id: userId, channel: 'inapp', type: 'push_test', title: row.title.slice(0, 200), body: row.body.slice(0, 500),
          data: { href: row.href }, dedupe_key: row.dedupeKey, sent_at: new Date().toISOString(),
        })
        if (error) throw new Error(`inapp_${error.code ?? 'error'}`)
      },
    },
    userId,
    { title: t('notifTitle'), body: t('notifBody'), href: PUSH_TEST_HREF, lang },
  )
  return jsonOk(outcome)
}
