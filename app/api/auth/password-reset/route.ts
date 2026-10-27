/**
 * POST /api/auth/password-reset { email }
 * Lien de réinitialisation envoyé par NOTRE e-mail (resetPassword) au lieu du modèle Supabase :
 * generateLink({ type: 'recovery' }) côté serveur → /auth/confirmer?token_hash=…&type=recovery&next=/nouveau-mot-de-passe.
 * Réponse neutre et immédiate : la recherche du compte et l'envoi se font APRÈS la réponse
 * (même durée que l'adresse existe ou non). 415 / 403 (JSON même origine exigé) · 422 adresse invalide ·
 * 429 / 503 + Retry-After.
 * Démonstration : 200 { ok: true, demo: true }.
 */
import { after } from 'next/server'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { clientIp } from '@/lib/data/server/rate-limit'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { prepareReset } from '@/lib/auth/email-flows'
import { serverFlowDeps } from '@/lib/auth/email-flows-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  let body: unknown
  try { body = await req.json() } catch { return jsonError(400, 'invalid_body', 'Requête invalide.') }
  if (!SUPABASE_ENABLED) return jsonOk({ ok: true, demo: true })

  const deps = serverFlowDeps()
  if (!deps) return jsonError(503, 'unavailable', 'Service momentanément indisponible. Réessayez dans un instant.')

  const { result, deliver } = await prepareReset(deps, body, clientIp(req.headers))
  if (deliver) after(deliver)
  if (result.status === 200) return jsonOk(result.body)
  return jsonError(result.status, result.code, result.message, 'retryAfter' in result ? { 'Retry-After': String(result.retryAfter) } : undefined)
}
