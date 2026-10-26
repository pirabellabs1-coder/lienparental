/**
 * POST /api/vault-lock/webauthn/authenticate/options : défi de déverrouillage par empreinte / visage.
 */
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, serverError } from '@/lib/vault-lock/http'
import { WebauthnUnavailable, authenticationOptions } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const g = await guardMutation(req, 'webauthn', 20)
  if (!g.ok) return g.res
  try {
    const r = await authenticationOptions(req, g.principal)
    if (!r.ok) return jsonError(409, 'no_passkey', 'Aucune empreinte n’est enregistrée pour ce compte.')
    return jsonOk({ options: r.options })
  } catch (e) {
    return e instanceof WebauthnUnavailable ? jsonError(503, 'webauthn_unavailable', 'L’empreinte n’est pas encore disponible sur ce serveur. Utilisez votre code.') : serverError()
  }
}
