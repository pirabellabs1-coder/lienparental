/**
 * Verrou du coffre-fort : constantes et types partagés (client ET serveur).
 * Aucun secret ici : ce fichier est importé par des composants client.
 */

/** Délais d'inactivité proposés (minutes). */
export const TIMEOUT_OPTIONS = [1, 5, 10, 15, 30] as const
export type TimeoutMinutes = (typeof TIMEOUT_OPTIONS)[number]
export const DEFAULT_TIMEOUT_MINUTES: TimeoutMinutes = 10

/** Reverrouillage après passage en arrière-plan (secondes ; 0 = immédiat). */
export const BACKGROUND_OPTIONS = [0, 60, 300] as const
export type BackgroundSeconds = (typeof BACKGROUND_OPTIONS)[number]
export const DEFAULT_BACKGROUND_SECONDS: BackgroundSeconds = 60

/** Durée de vie absolue d'un déverrouillage, même avec activité continue. */
export const MAX_UNLOCK_SECONDS = 8 * 60 * 60

/** Essais de code avant blocage temporaire. */
export const MAX_PIN_ATTEMPTS = 5
/** Blocage progressif : 30 s, 1 min, 2 min, 4 min… plafonné à 1 h. */
export const LOCKOUT_BASE_SECONDS = 30
export const LOCKOUT_MAX_SECONDS = 60 * 60

export const PIN_LENGTH = 6
export const PIN_REGEX = /^\d{6}$/

/** Code de démonstration (docs/COMPTES_DEMO.md, section « Coffre-fort »). */
export const DEMO_PIN = '123456'

/** Codes trop prévisibles : chiffres identiques, suites croissantes ou décroissantes. */
export function isWeakPin(pin: string): boolean {
  if (!PIN_REGEX.test(pin)) return true
  if (/^(\d)\1{5}$/.test(pin)) return true
  const d = pin.split('').map(Number)
  const asc = d.every((v, i) => i === 0 || v === (d[i - 1]! + 1) % 10)
  const desc = d.every((v, i) => i === 0 || v === (d[i - 1]! + 9) % 10)
  return asc || desc
}

export function lockoutSeconds(lockouts: number): number {
  return Math.min(LOCKOUT_MAX_SECONDS, LOCKOUT_BASE_SECONDS * 2 ** Math.max(0, lockouts - 1))
}

export type PasskeySummary = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  /** Clé synchronisée entre appareils (iCloud, Google…) ou liée à cet appareil. */
  synced: boolean
  simulated?: boolean
}

/** État renvoyé au navigateur. Ne contient aucun secret. */
export type VaultStatus = {
  /** Le verrou est-il actif pour ce compte. */
  enabled: boolean
  /** Session coffre valide côté serveur (cookie signé). */
  unlocked: boolean
  /** Fin du déverrouillage (epoch ms) si déverrouillé. */
  expiresAt: number | null
  timeoutMinutes: number
  backgroundSeconds: number
  hasPin: boolean
  /** Le compte possède un mot de passe (sinon connexion Google seule). */
  hasPassword: boolean
  /** Connexion récente (moins de 5 min) : permet de redéfinir le code sans mot de passe. */
  recentLogin: boolean
  passkeys: PasskeySummary[]
  /** Blocage temporaire du code (epoch ms). */
  pinLockedUntil: number | null
  pinAttemptsLeft: number
  demo: boolean
  /**
   * Verrou indisponible sur ce serveur (VAULT_LOCK_SECRET ou clé service absente) :
   * le coffre reste accessible SANS verrou et les réglages l'indiquent.
   */
  notConfigured?: boolean
}

export const VAULT_API = '/api/vault-lock'
