import 'server-only'
/**
 * État initial de la garde pour un rendu serveur (layout du coffre, page de réglages).
 * Fail closed : toute erreur = coffre fermé avec un message.
 * Exception volontaire : verrou NON CONFIGURÉ sur le serveur (secret ou clé service absents)
 * → coffre accessible sans verrou (session du parent toujours exigée), réglages en lecture seule.
 */
import { DEFAULT_BACKGROUND_SECONDS, DEFAULT_TIMEOUT_MINUTES, MAX_PIN_ATTEMPTS, type VaultStatus } from './config'
import { resolvePrincipal, vaultLockConfigured, type VaultPrincipal } from './context'
import { buildStatus } from './session'

/** État « verrou non configuré » : ouvert, sans verrou, aucun réglage modifiable. */
function unconfiguredStatus(p: VaultPrincipal): VaultStatus {
  return {
    enabled: false, unlocked: true, expiresAt: null,
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES, backgroundSeconds: DEFAULT_BACKGROUND_SECONDS,
    hasPin: false, hasPassword: p.hasPassword, recentLogin: p.recentLogin, passkeys: [],
    pinLockedUntil: null, pinAttemptsLeft: MAX_PIN_ATTEMPTS, demo: p.mode === 'demo', notConfigured: true,
  }
}

export type GateBlocked = { title: string; message: string; href?: string; cta?: string }

export async function loadVaultGateState(): Promise<{ status: VaultStatus | null; blocked: GateBlocked | null }> {
  const configured = vaultLockConfigured()
  const p = await resolvePrincipal({ allowUnconfigured: !configured }).catch(() => null)
  if (!p) return { status: null, blocked: { title: 'Coffre-fort indisponible', message: 'Impossible de vérifier le verrou du coffre-fort. Réessayez dans un instant.' } }
  if (!p.ok) {
    switch (p.reason) {
      case 'not_configured':
        return { status: null, blocked: { title: 'Coffre-fort verrouillé', message: 'Le verrouillage du coffre-fort n’est pas encore configuré sur ce serveur. Contactez le support.' } }
      case 'mfa_required':
        return { status: null, blocked: { title: 'Confirmation requise', message: 'Confirmez votre identité avec votre code de double authentification.', href: '/onboarding/connexion?suite=/app/coffre', cta: 'Me reconnecter' } }
      default:
        return { status: null, blocked: { title: 'Session expirée', message: 'Reconnectez-vous pour accéder au coffre-fort.', href: '/onboarding/connexion?suite=/app/coffre', cta: 'Me reconnecter' } }
    }
  }
  if (!configured) return { status: unconfiguredStatus(p), blocked: null }
  try {
    return { status: await buildStatus(p), blocked: null }
  } catch {
    return { status: null, blocked: { title: 'Coffre-fort indisponible', message: 'Impossible de vérifier le verrou du coffre-fort. Réessayez dans un instant.' } }
  }
}
