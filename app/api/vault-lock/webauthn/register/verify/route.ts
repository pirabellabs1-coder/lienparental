/**
 * POST /api/vault-lock/webauthn/register/verify { response } : vérifie l'attestation
 * (défi, origine, RP ID, vérification de l'utilisateur) et enregistre la clé publique.
 */
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { buildStatus, readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { WebauthnUnavailable, verifyRegistration, type RegistrationResponseJSON } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const b64 = z.string().regex(/^[A-Za-z0-9_-]+$/).max(8192)
const schemaFor = (t: (key: string) => string) => z.object({
  response: z.object({
    id: b64.max(1400),
    rawId: b64.max(1400),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: b64,
      attestationObject: b64,
      transports: z.array(z.string().max(32)).max(8).optional(),
      authenticatorData: b64.optional(),
      publicKey: b64.optional(),
      publicKeyAlgorithm: z.number().int().optional(),
    }).passthrough(),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).nullish().transform((v) => v ?? undefined),
    clientExtensionResults: z.record(z.unknown()).default({}),
  }).passthrough(),
}).strict()

export async function POST(req: Request) {
  const t = await getTranslations('server.vaultLock')
  const g = await guardMutation(req, 'webauthn', 20)
  if (!g.ok) return g.res
  const body = await readJson(req, schemaFor(t))
  if (!body.ok) return body.res
  try {
    const settings = await vaultStore(g.principal.mode).getSettings(g.principal.userId)
    if (settings.enabled && !(await readUnlock(g.principal, settings))) {
      return jsonError(403, 'vault_locked', t('unlockToAddDevice'))
    }
    const r = await verifyRegistration(req, g.principal, body.data.response as unknown as RegistrationResponseJSON)
    if (!r.ok) {
      return r.code === 'challenge_expired'
        ? jsonError(410, 'challenge_expired', t('challengeExpired'))
        : jsonError(400, 'verification_failed', t('passkeyVerifyFailed'))
    }
    return jsonOk({ status: await buildStatus(g.principal) }, 201)
  } catch (e) {
    if (e instanceof WebauthnUnavailable) return jsonError(503, 'webauthn_unavailable', t('webauthnUnavailable'))
    const unique = e instanceof Error && e.message === 'vault-lock:passkeys.add:23505'
    return unique ? jsonError(409, 'already_registered', t('deviceAlreadyRegistered')) : serverError()
  }
}
