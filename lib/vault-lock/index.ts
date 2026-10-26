import 'server-only'
/**
 * Verrou du coffre-fort : point d'entrée serveur.
 *
 * Pour toute route API qui sert des données du coffre (documents, témoignages,
 * export) :
 *
 *   const vault = await requireVaultUnlocked()
 *   if (!vault.ok) return vaultDeniedResponse(vault)
 *
 * Refus = 401 (session absente), 403 `mfa_required`, 403 `vault_locked`
 * (le client affiche l'écran de déverrouillage).
 * Verrou non configuré sur le serveur (lib/vault-lock/context → vaultLockConfigured) :
 * accès accordé sans verrou (`lockEnabled: false`), la session du parent reste exigée.
 */
import { jsonError } from '@/lib/data/server/http'
import { resolvePrincipal, vaultLockConfigured, type VaultPrincipal } from './context'
import { readUnlock } from './session'
import { vaultStore } from './store'

export type VaultGuardOk = { ok: true; principal: VaultPrincipal; lockEnabled: boolean }
export type VaultGuardDenied = { ok: false; reason: 'unauthenticated' | 'mfa_required' | 'not_configured' | 'vault_locked' }

export async function requireVaultUnlocked(): Promise<VaultGuardOk | VaultGuardDenied> {
  const configured = vaultLockConfigured()
  const r = await resolvePrincipal({ allowUnconfigured: !configured })
  if (!r.ok) return r
  if (!configured) return { ok: true, principal: r, lockEnabled: false }
  try {
    const settings = await vaultStore(r.mode).getSettings(r.userId)
    if (!settings.enabled) return { ok: true, principal: r, lockEnabled: false }
    const unlock = await readUnlock(r, settings)
    return unlock ? { ok: true, principal: r, lockEnabled: true } : { ok: false, reason: 'vault_locked' }
  } catch {
    // Fail closed : réglages illisibles = coffre verrouillé.
    return { ok: false, reason: 'vault_locked' }
  }
}

export function vaultDeniedResponse(d: VaultGuardDenied) {
  switch (d.reason) {
    case 'unauthenticated':
      return jsonError(401, 'unauthenticated', 'Votre session a expiré. Reconnectez-vous.')
    case 'mfa_required':
      return jsonError(403, 'mfa_required', 'Confirmez votre identité avec votre code de double authentification.')
    case 'not_configured':
      return jsonError(503, 'not_configured', 'Le verrouillage du coffre-fort n’est pas configuré sur ce serveur.')
    case 'vault_locked':
      return jsonError(403, 'vault_locked', 'Le coffre-fort est verrouillé. Déverrouillez-le pour continuer.')
  }
}

export { resolvePrincipal } from './context'
export { buildStatus } from './session'
