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
import { getTranslations } from 'next-intl/server'
import { libT } from '@/lib/i18n/runtime'

/** Textes de la garde dans la langue de la requête ; repli français (fail closed, jamais d'exception). */
async function vaultLockT(): Promise<(key: string) => string> {
  try {
    const t = await getTranslations('shared.vaultLock')
    return (key: string) => t(key as never)
  } catch {
    const t = libT('shared.vaultLock', 'fr')
    return (key: string) => t(key)
  }
}

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
  const t = await vaultLockT()
  const unavailable = (): GateBlocked => ({ title: t('gate.unavailableTitle'), message: t('gate.unavailableMessage') })
  if (!p) return { status: null, blocked: unavailable() }
  if (!p.ok) {
    switch (p.reason) {
      case 'not_configured':
        return { status: null, blocked: { title: t('gate.lockedTitle'), message: t('gate.notConfiguredMessage') } }
      case 'mfa_required':
        return { status: null, blocked: { title: t('gate.mfaTitle'), message: t('mfaRequired'), href: '/onboarding/connexion?suite=/app/coffre', cta: t('gate.reconnect') } }
      default:
        return { status: null, blocked: { title: t('gate.sessionTitle'), message: t('gate.sessionMessage'), href: '/onboarding/connexion?suite=/app/coffre', cta: t('gate.reconnect') } }
    }
  }
  if (!configured) return { status: unconfiguredStatus(p), blocked: null }
  try {
    return { status: await buildStatus(p), blocked: null }
  } catch {
    return { status: null, blocked: unavailable() }
  }
}
