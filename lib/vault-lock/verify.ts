import 'server-only'
/**
 * Vérifications serveur d'un facteur de déverrouillage, avec comptage des échecs.
 * Ordre immuable : blocage en cours ? → vérification → échec compté / compteur remis à zéro.
 */
import { verifyPassword } from '@/lib/auth/verify-password'
import { PIN_REGEX } from './config'
import { demoPasswordFor, type VaultPrincipal } from './context'
import { safeEqual, verifyPinHash } from './crypto'
import { vaultStore, type AttemptState, type LockSettings } from './store'

export type FactorResult =
  | { ok: true }
  | { ok: false; code: 'locked_out'; lockedUntil: number }
  | { ok: false; code: 'invalid'; attemptsLeft: number; lockedUntil: number | null }
  | { ok: false; code: 'no_pin' }
  | { ok: false; code: 'provider_rate_limited' | 'error' }

function failed(a: AttemptState): FactorResult {
  return a.lockedUntil ? { ok: false, code: 'locked_out', lockedUntil: a.lockedUntil } : { ok: false, code: 'invalid', attemptsLeft: a.attemptsLeft, lockedUntil: null }
}

/**
 * Code à 6 chiffres. m3 (audit v3) : l'essai est RÉSERVÉ (compté) atomiquement en base
 * avant le calcul scrypt. Des requêtes parallèles ne peuvent donc pas obtenir plus de
 * MAX_PIN_ATTEMPTS vérifications avant le blocage (l'ancien ordre « lire, vérifier,
 * compter » laissait passer N essais simultanés). Un succès efface le compteur.
 */
export async function checkPin(principal: VaultPrincipal, settings: LockSettings, pin: string): Promise<FactorResult> {
  const store = vaultStore(principal.mode)
  if (!settings.pinHash) return { ok: false, code: 'no_pin' }
  const reserved = await store.reserveAttempt(principal.userId, 'pin')
  if (!reserved.allowed) return { ok: false, code: 'locked_out', lockedUntil: reserved.lockedUntil ?? Date.now() }
  // Le format est validé par zod en amont ; on refuse quand même tout le reste (déjà compté comme échec).
  const ok = PIN_REGEX.test(pin) && (await verifyPinHash(pin, settings.pinHash))
  if (!ok) return failed(reserved)
  await store.clearAttempts(principal.userId, 'pin')
  return { ok: true }
}

/** Mot de passe du compte. Un succès remet aussi à zéro le blocage du code (réinitialisation). */
export async function checkPassword(principal: VaultPrincipal, password: string): Promise<FactorResult> {
  const store = vaultStore(principal.mode)
  const before = await store.getAttempts(principal.userId, 'password')
  if (before.lockedUntil) return { ok: false, code: 'locked_out', lockedUntil: before.lockedUntil }

  let ok = false
  if (principal.mode === 'demo') {
    const expected = demoPasswordFor(principal.userId)
    ok = expected !== null && safeEqual(password, expected)
  } else {
    if (!principal.hasPassword) return { ok: false, code: 'error' }
    const r = await verifyPassword(principal.email, password)
    if (r === 'rate_limited') return { ok: false, code: 'provider_rate_limited' }
    if (r === 'error') return { ok: false, code: 'error' }
    ok = r === 'ok'
  }
  if (!ok) return failed(await store.registerFailure(principal.userId, 'password'))
  await Promise.all([store.clearAttempts(principal.userId, 'password'), store.clearAttempts(principal.userId, 'pin')])
  return { ok: true }
}
