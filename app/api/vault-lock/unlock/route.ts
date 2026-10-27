/**
 * POST /api/vault-lock/unlock : déverrouille avec le code à 6 chiffres ou le mot de passe du compte.
 *   { method: 'pin', pin: '123456' } | { method: 'password', password: '…' }
 * 200 { status } + cookie de session coffre ; 401 invalid_pin / invalid_password (essais restants) ;
 * 429 locked_out (blocage progressif) ; 409 no_pin.
 */
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { jsonOk } from '@/lib/data/server/http'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { factorFailure } from '@/lib/vault-lock/responses'
import { buildStatus, issueUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'
import { checkPassword, checkPin } from '@/lib/vault-lock/verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schemaFor = (t: (key: string) => string) => z.discriminatedUnion('method', [
  z.object({ method: z.literal('pin'), pin: z.string().regex(/^\d{6}$/, t('pinFormat')) }).strict(),
  z.object({ method: z.literal('password'), password: z.string().min(1, t('passwordRequired')).max(256) }).strict(),
])

export async function POST(req: Request) {
  const t = await getTranslations('server.vaultLock')
  const g = await guardMutation(req, 'unlock', 20)
  if (!g.ok) return g.res
  const body = await readJson(req, schemaFor(t))
  if (!body.ok) return body.res
  const principal = g.principal

  try {
    const settings = await vaultStore(principal.mode).getSettings(principal.userId)
    const result = body.data.method === 'pin'
      ? await checkPin(principal, settings, body.data.pin)
      : await checkPassword(principal, body.data.password)
    if (!result.ok) return factorFailure(result, body.data.method)

    await issueUnlock(principal, settings)
    return jsonOk({ status: await buildStatus(principal) })
  } catch {
    return serverError()
  }
}
