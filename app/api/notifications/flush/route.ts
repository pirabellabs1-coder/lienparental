/**
 * POST /api/notifications/flush
 * Livraison immédiate (in-app + push) des notifications que l'appelant vient de
 * provoquer (message envoyé, dossier partagé, événement partagé…) : seules les
 * tâches dues dont il est l'AUTEUR sont traitées. Sans cet appel, le cron les
 * livre dans les 5 minutes. Réponse sans donnée : { ok, processed }.
 */
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { flushForActor } from '@/lib/notify/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    if (ctx.reason === 'disabled') return jsonOk({ ok: true, processed: 0 })
    return jsonError(ctx.reason === 'mfa_required' ? 403 : 401, ctx.reason, DENIED_MESSAGES[ctx.reason])
  }
  const rl = await rateLimit(userKey('notif-flush', ctx.user.id), 30, 60_000)
  if (!rl.ok) return rateLimitedResponse(rl)
  try {
    const report = await flushForActor(ctx.user.id)
    return jsonOk({ ok: true, processed: report?.claimed ?? 0 })
  } catch {
    // Le cron reprendra : l'action de l'utilisateur n'est jamais mise en échec.
    return jsonOk({ ok: true, processed: 0 })
  }
}
