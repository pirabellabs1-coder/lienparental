/**
 * POST /api/vault-lock/webauthn/authenticate/verify { response } : vérifie la signature
 * (clé publique enregistrée, défi à usage unique, origine, RP ID, vérification de
 * l'utilisateur, compteur) puis pose le cookie de session coffre.
 */
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { buildStatus, issueUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { WebauthnUnavailable, verifyAuthentication, type AuthenticationResponseJSON } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const b64 = z.string().regex(/^[A-Za-z0-9_-]*$/).max(8192)
const schema = z.object({
  response: z.object({
    id: b64.min(1).max(1400),
    rawId: b64.min(1).max(1400),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: b64.min(1),
      authenticatorData: b64.min(1),
      signature: b64.min(1),
      userHandle: b64.nullish().transform((v) => v ?? undefined),
    }).passthrough(),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).nullish().transform((v) => v ?? undefined),
    clientExtensionResults: z.record(z.unknown()).default({}),
  }).passthrough(),
}).strict()

export async function POST(req: Request) {
  const g = await guardMutation(req, 'webauthn', 20)
  if (!g.ok) return g.res
  const body = await readJson(req, schema)
  if (!body.ok) return body.res
  const p = g.principal
  try {
    const r = await verifyAuthentication(req, p, body.data.response as unknown as AuthenticationResponseJSON)
    if (!r.ok) {
      return r.code === 'challenge_expired'
        ? jsonError(410, 'challenge_expired', 'La demande a expiré. Recommencez.')
        : jsonError(401, 'verification_failed', 'Empreinte non reconnue. Réessayez ou utilisez votre code.')
    }
    const store = vaultStore(p.mode)
    const settings = await store.getSettings(p.userId)
    await store.clearAttempts(p.userId, 'pin')
    await issueUnlock(p, settings)
    return jsonOk({ status: await buildStatus(p) })
  } catch (e) {
    return e instanceof WebauthnUnavailable ? jsonError(503, 'webauthn_unavailable', 'L’empreinte n’est pas encore disponible sur ce serveur. Utilisez votre code.') : serverError()
  }
}
