/**
 * POST /api/vault-lock/webauthn/register/options { name } : options de création d'une passkey
 * de plateforme (empreinte, visage). Coffre déverrouillé requis si le verrou est actif.
 */
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { WebauthnUnavailable, registrationOptions } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ name: z.string().trim().min(1, 'Donnez un nom à cet appareil.').max(60) }).strict()

export async function POST(req: Request) {
  const g = await guardMutation(req, 'webauthn', 20)
  if (!g.ok) return g.res
  const body = await readJson(req, schema)
  if (!body.ok) return body.res
  try {
    const settings = await vaultStore(g.principal.mode).getSettings(g.principal.userId)
    if (settings.enabled && !(await readUnlock(g.principal, settings))) {
      return jsonError(403, 'vault_locked', 'Déverrouillez le coffre-fort pour ajouter un appareil.')
    }
    const r = await registrationOptions(req, g.principal, body.data.name)
    if (!r.ok) return jsonError(409, 'too_many', 'Nombre maximal d’appareils atteint. Retirez-en un pour continuer.')
    return jsonOk({ options: r.options })
  } catch (e) {
    return e instanceof WebauthnUnavailable ? jsonError(503, 'webauthn_unavailable', 'L’empreinte n’est pas encore disponible sur ce serveur. Utilisez votre code.') : serverError()
  }
}
