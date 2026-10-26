/**
 * DELETE /api/vault-lock/passkeys/:id : retire une empreinte / un visage enregistré.
 * Coffre déverrouillé requis ; les autres appareils sont reverrouillés (époque).
 * Refusé si c'est la dernière méthode de déverrouillage du compte.
 */
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, serverError } from '@/lib/vault-lock/http'
import { buildStatus, issueUnlock, readUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const idSchema = z.string().uuid()

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardMutation(req, 'passkeys', 20)
  if (!g.ok) return g.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return jsonError(404, 'not_found', 'Appareil introuvable.')
  const p = g.principal
  const store = vaultStore(p.mode)
  try {
    const settings = await store.getSettings(p.userId)
    if (settings.enabled && !(await readUnlock(p, settings))) {
      return jsonError(403, 'vault_locked', 'Déverrouillez le coffre-fort pour modifier ces réglages.')
    }
    const passkeys = await store.listPasskeys(p.userId)
    if (settings.enabled && !settings.pinHash && !p.hasPassword && passkeys.length <= 1) {
      return jsonError(409, 'last_method', 'C’est votre seule méthode de déverrouillage : définissez d’abord un code.')
    }
    // Filtré par user_id : impossible de supprimer la clé d'un autre compte (pas d'IDOR).
    if (!(await store.deletePasskey(p.userId, id.data))) return jsonError(404, 'not_found', 'Appareil introuvable.')
    const next = await store.updateSettings(p.userId, { bumpEpoch: true })
    if (next.enabled) await issueUnlock(p, next)
    return jsonOk({ status: await buildStatus(p) })
  } catch {
    return serverError()
  }
}
