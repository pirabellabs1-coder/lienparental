/**
 * POST /api/auth/signup
 *   { email }                → inscription : compte créé (mot de passe ALÉATOIRE, jamais celui saisi)
 *                              + code envoyé par NOTRE e-mail
 *   { email, resend: true }  → « Renvoyer le code » (nouveau code, compte inchangé)
 * Le mot de passe choisi reste dans le navigateur et n'est posé qu'après vérification de l'adresse
 * (lib/auth/email-flows.ts, protection contre le pré-détournement de compte).
 * Remplace supabase.auth.signUp côté navigateur : les modèles d'e-mail Supabase ne servent plus que de repli.
 * Réponses : 200 { ok: true } neutre et en temps constant (traitement après la réponse) · 415 / 403
 * (JSON même origine exigé) · 422 adresse invalide · 429 / 503 + Retry-After.
 * Démonstration (sans Supabase) : 200 { ok: true, demo: true }, aucun envoi.
 */
import { after } from 'next/server'
import { jsonError, jsonOk, rejectCrossSiteJson } from '@/lib/data/server/http'
import { clientIp } from '@/lib/data/server/rate-limit'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { prepareSignup, type FlowDeps } from '@/lib/auth/email-flows'
import { serverFlowDeps } from '@/lib/auth/email-flows-server'
import { localeForUser, requestLocale } from '@/lib/email/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejected = rejectCrossSiteJson(req)
  if (rejected) return rejected
  let body: unknown
  try { body = await req.json() } catch { return jsonError(400, 'invalid_body', 'Requête invalide.') }
  if (!SUPABASE_ENABLED) return jsonOk({ ok: true, demo: true })

  const deps = serverFlowDeps()
  if (!deps) return jsonError(503, 'unavailable', 'L’inscription est momentanément indisponible.')

  // Langue des e-mails : compte confirmé → sa langue ; sinon langue d'affichage du visiteur (cookie lp_locale).
  const localeDeps: FlowDeps = {
    ...deps,
    userLocale: (userId) => localeForUser(userId),
  }
  const { result, deliver } = await prepareSignup(localeDeps, body, clientIp(req.headers), await requestLocale())
  if (deliver) after(deliver)
  if (result.status === 200) return jsonOk(result.body)
  return jsonError(result.status, result.code, result.message, 'retryAfter' in result ? { 'Retry-After': String(result.retryAfter) } : undefined)
}
