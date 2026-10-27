/**
 * POST /api/vault-lock/webauthn/authenticate/options : défi de déverrouillage par empreinte / visage.
 */
import { getTranslations } from 'next-intl/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, serverError } from '@/lib/vault-lock/http'
import { WebauthnUnavailable, authenticationOptions } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const t = await getTranslations('server.vaultLock')
  const g = await guardMutation(req, 'webauthn', 20)
  if (!g.ok) return g.res
  try {
    const r = await authenticationOptions(req, g.principal)
    if (!r.ok) return jsonError(409, 'no_passkey', t('noPasskey'))
    return jsonOk({ options: r.options })
  } catch (e) {
    return e instanceof WebauthnUnavailable ? jsonError(503, 'webauthn_unavailable', t('webauthnUnavailable')) : serverError()
  }
}
