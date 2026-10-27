/**
 * POST /api/vault-lock/webauthn/simulate : empreinte SIMULÉE, mode démonstration uniquement
 * (navigateur sans WebAuthn, capture automatisée, bibliothèque serveur non installée).
 *   { action: 'register', name } : enregistre un appareil fictif (coffre déverrouillé requis) ;
 *   { action: 'authenticate' }   : déverrouille si un appareil fictif existe.
 * Hors démonstration : 404 (la route n'existe pas pour un vrai compte).
 */
import { getTranslations } from 'next-intl/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { DEMO_MODE } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { buildStatus, issueUnlock, readUnlock } from '@/lib/vault-lock/session'
import { MAX_PASSKEYS, vaultStore } from '@/lib/vault-lock/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schemaFor = (t: (key: string) => string) => z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), name: z.string().trim().min(1).max(60) }).strict(),
  z.object({ action: z.literal('authenticate') }).strict(),
])

export async function POST(req: Request) {
  const t = await getTranslations('server.vaultLock')
  if (!DEMO_MODE || SUPABASE_ENABLED) return jsonError(404, 'not_found', 'Introuvable.')
  const g = await guardMutation(req, 'webauthn-sim', 20)
  if (!g.ok) return g.res
  if (g.principal.mode !== 'demo') return jsonError(404, 'not_found', 'Introuvable.')
  const body = await readJson(req, schemaFor(t))
  if (!body.ok) return body.res
  const p = g.principal
  const store = vaultStore('demo')

  try {
    const settings = await store.getSettings(p.userId)
    if (body.data.action === 'register') {
      if (settings.enabled && !(await readUnlock(p, settings))) {
        return jsonError(403, 'vault_locked', t('unlockToAddDevice'))
      }
      if ((await store.listPasskeys(p.userId)).length >= MAX_PASSKEYS) {
        return jsonError(409, 'too_many', t('tooManyDevices'))
      }
      await store.addPasskey(p.userId, {
        name: body.data.name, credentialId: `sim-${randomBytes(12).toString('base64url')}`, publicKey: 'simulated',
        counter: 0, transports: ['internal'], synced: false, simulated: true,
      })
      return jsonOk({ status: await buildStatus(p) }, 201)
    }

    const sim = (await store.listPasskeys(p.userId)).find((k) => k.simulated)
    if (!sim) return jsonError(409, 'no_passkey', t('noPasskey'))
    await store.markPasskeyUsed(p.userId, sim.id, 0)
    await store.clearAttempts(p.userId, 'pin')
    await issueUnlock(p, settings)
    return jsonOk({ status: await buildStatus(p) })
  } catch {
    return serverError()
  }
}
