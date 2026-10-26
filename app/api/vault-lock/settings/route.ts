/**
 * PATCH /api/vault-lock/settings : active / désactive le verrou, règle les délais.
 *   { enabled?: boolean, timeoutMinutes?: 1|5|10|15|30, backgroundSeconds?: 0|60|300 }
 * Verrou actif : exige un coffre déverrouillé sur cet appareil (cookie vérifié ici).
 * Activation : exige au moins une méthode (code, mot de passe du compte ou empreinte).
 */
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { BACKGROUND_OPTIONS, TIMEOUT_OPTIONS } from '@/lib/vault-lock/config'
import { guardMutation, readJson, serverError } from '@/lib/vault-lock/http'
import { buildStatus, clearUnlockCookie, issueUnlock, readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  enabled: z.boolean().optional(),
  timeoutMinutes: z.number().int().refine((v) => (TIMEOUT_OPTIONS as readonly number[]).includes(v), 'Délai non proposé.').optional(),
  backgroundSeconds: z.number().int().refine((v) => (BACKGROUND_OPTIONS as readonly number[]).includes(v), 'Délai non proposé.').optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Aucun réglage à modifier.')

export async function PATCH(req: Request) {
  const g = await guardMutation(req, 'settings', 30)
  if (!g.ok) return g.res
  const body = await readJson(req, schema)
  if (!body.ok) return body.res
  const p = g.principal
  const store = vaultStore(p.mode)

  try {
    const current = await store.getSettings(p.userId)
    if (current.enabled && !(await readUnlock(p, current))) {
      return jsonError(403, 'vault_locked', 'Déverrouillez le coffre-fort pour modifier ces réglages.')
    }
    if (body.data.enabled === true && !current.enabled) {
      const passkeys = await store.listPasskeys(p.userId)
      if (!current.pinHash && !p.hasPassword && passkeys.length === 0) {
        return jsonError(409, 'no_method', 'Définissez d’abord un code ou enregistrez votre empreinte.')
      }
    }

    const next = await store.updateSettings(p.userId, body.data)
    if (next.enabled) {
      // Activation ou nouveau délai : cet appareil reste déverrouillé, avec la nouvelle échéance.
      const renewed = current.enabled ? await issueUnlock(p, next, true) : null
      if (!renewed) await issueUnlock(p, next)
    } else {
      await clearUnlockCookie(p)
    }
    return jsonOk({ status: await buildStatus(p) })
  } catch {
    return serverError()
  }
}
