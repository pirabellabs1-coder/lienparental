/**
 * POST /api/vault-lock/webauthn/register/options { name } : options de création d'une passkey
 * de plateforme (empreinte, visage). Coffre déverrouillé requis si le verrou est actif.
 */
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { WebauthnUnavailable, registrationOptions } from '@/lib/vault-lock/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schemaFor = (t: (key: string) => string) => z.object({ name: z.string().trim().min(1, t('deviceNameRequired')).max(60) }).strict()

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
    const r = await registrationOptions(req, g.principal, body.data.name)
    if (!r.ok) return jsonError(409, 'too_many', t('tooManyDevicesRemove'))
    return jsonOk({ options: r.options })
  } catch (e) {
    return e instanceof WebauthnUnavailable ? jsonError(503, 'webauthn_unavailable', t('webauthnUnavailable')) : serverError()
  }
}
