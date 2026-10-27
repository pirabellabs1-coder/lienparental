/**
 * POST /api/auth/login-check
 * Appelé par le navigateur juste après une connexion réussie (mot de passe, puis
 * code 2FA le cas échéant, ou vérification de l'inscription). Lié à la session :
 * l'identité vient du JWT revalidé, l'identifiant de session du claim session_id
 * (getClaims). Idempotent par session, limité en débit. Détecte un nouvel
 * appareil et envoie l'alerte de sécurité (lib/notify/login.ts).
 * Réponse neutre { ok: true } dans tous les cas autorisés (rien n'est divulgué).
 */
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { DENIED_MESSAGES, requireAuthedUser } from '@/lib/auth/guard'
import { currentSessionId, recordSignIn } from '@/lib/notify/login'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    if (ctx.reason === 'disabled') return jsonOk({ ok: true })
    return jsonError(ctx.reason === 'mfa_required' ? 403 : 401, ctx.reason, DENIED_MESSAGES[ctx.reason])
  }
  const rl = await rateLimit(userKey('login-check', ctx.user.id), 10, 10 * 60_000)
  if (!rl.ok) return rateLimitedResponse(rl)

  const sessionId = await currentSessionId(ctx.supabase)
  if (sessionId) await recordSignIn({ userId: ctx.user.id, sessionId, headers: req.headers })
  return jsonOk({ ok: true })
}
