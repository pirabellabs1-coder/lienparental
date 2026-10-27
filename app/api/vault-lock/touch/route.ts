/**
 * POST /api/vault-lock/touch : prolonge le déverrouillage après une activité (glissant,
 * échéance absolue inchangée). 200 { expiresAt } ; 403 vault_locked si déjà expiré.
 */
import { getTranslations } from 'next-intl/server'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { guardMutation, serverError } from '@/lib/vault-lock/http'
import { issueUnlock } from '@/lib/vault-lock/session'
import { vaultStore } from '@/lib/vault-lock/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const t = await getTranslations('server.vaultLock')
  const g = await guardMutation(req, 'touch', 30)
  if (!g.ok) return g.res
  try {
    const settings = await vaultStore(g.principal.mode).getSettings(g.principal.userId)
    if (!settings.enabled) return jsonOk({ expiresAt: null })
    const expiresAt = await issueUnlock(g.principal, settings, true)
    if (!expiresAt) return jsonError(403, 'vault_locked', t('vaultLocked'))
    return jsonOk({ expiresAt })
  } catch {
    return serverError()
  }
}
