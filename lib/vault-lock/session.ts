import 'server-only'
/**
 * Session « coffre déverrouillé » : cookie HttpOnly, SameSite=Strict, signé (HMAC),
 * courte durée, glissant sur l'activité, plafonné à MAX_UNLOCK_SECONDS.
 *
 * Le cookie est lié : à l'utilisateur, à la session Supabase (claim session_id)
 * et à l'« époque » des réglages (changer de code ou supprimer une clé
 * invalide les déverrouillages de tous les appareils).
 */
import { cookies } from 'next/headers'
import { MAX_PIN_ATTEMPTS, MAX_UNLOCK_SECONDS, type VaultStatus } from './config'
import { signToken, verifyToken } from './crypto'
import type { VaultPrincipal } from './context'
import { passkeySummary, vaultStore, type LockSettings } from './store'

const SECURE = process.env.NODE_ENV === 'production'
// __Host- : Secure, Path=/, sans Domain (impossible à poser depuis un sous-domaine).
export const UNLOCK_COOKIE = SECURE ? '__Host-lp_vault' : 'lp_vault'

type UnlockPayload = { u: string; s: string; e: number; iat: number; exp: number; max: number }

function readPayload(raw: string | undefined, principal: VaultPrincipal, settings: LockSettings): UnlockPayload | null {
  const p = verifyToken<UnlockPayload>(raw)
  if (!p) return null
  const now = Math.floor(Date.now() / 1000)
  if (p.u !== principal.userId) return null
  if ((principal.sessionId ?? '') !== p.s) return null
  if (p.e !== settings.epoch) return null
  if (!(now < p.exp && now < p.max)) return null
  return p
}

/** Déverrouillage valide pour la requête courante (lecture seule). */
export async function readUnlock(principal: VaultPrincipal, settings: LockSettings): Promise<{ expiresAt: number } | null> {
  const store = await cookies()
  const p = readPayload(store.get(UNLOCK_COOKIE)?.value, principal, settings)
  return p ? { expiresAt: p.exp * 1000 } : null
}

/**
 * Pose (ou prolonge) le cookie. `renew` = prolongation d'un déverrouillage existant :
 * l'échéance absolue d'origine est conservée. Route Handlers / Server Actions uniquement.
 */
export async function issueUnlock(principal: VaultPrincipal, settings: LockSettings, renew = false): Promise<number | null> {
  const store = await cookies()
  const now = Math.floor(Date.now() / 1000)
  let max = now + MAX_UNLOCK_SECONDS
  let iat = now
  if (renew) {
    const prev = readPayload(store.get(UNLOCK_COOKIE)?.value, principal, settings)
    if (!prev) return null
    max = prev.max
    iat = prev.iat
  }
  const exp = Math.min(now + settings.timeoutMinutes * 60, max)
  const token = signToken({ u: principal.userId, s: principal.sessionId ?? '', e: settings.epoch, iat, exp, max } satisfies UnlockPayload)
  // Phase 2 (0370) : la base n'ouvre le coffre que si la ligne vault_unlocks existe pour
  // CETTE session. Elle est écrite AVANT le cookie : en cas d'échec, aucun cookie n'est posé
  // (sinon l'interface se croirait déverrouillée face à une base fermée).
  await vaultStore(principal.mode).recordUnlock(principal.userId, principal.sessionId, exp * 1000)
  store.set(UNLOCK_COOKIE, token, { httpOnly: true, secure: SECURE, sameSite: 'strict', path: '/', maxAge: exp - now, priority: 'high' })
  return exp * 1000
}

export async function clearUnlockCookie(principal?: VaultPrincipal): Promise<void> {
  const store = await cookies()
  store.set(UNLOCK_COOKIE, '', { httpOnly: true, secure: SECURE, sameSite: 'strict', path: '/', maxAge: 0 })
  if (principal) await vaultStore(principal.mode).clearUnlock(principal.userId, principal.sessionId)
}

/** État complet pour l'interface (aucun secret). */
export async function buildStatus(principal: VaultPrincipal): Promise<VaultStatus> {
  const store = vaultStore(principal.mode)
  const [settings, passkeys, attempts] = await Promise.all([
    store.getSettings(principal.userId),
    store.listPasskeys(principal.userId),
    store.getAttempts(principal.userId, 'pin'),
  ])
  const unlock = settings.enabled ? await readUnlock(principal, settings) : null
  return {
    enabled: settings.enabled,
    unlocked: !settings.enabled || unlock !== null,
    expiresAt: unlock?.expiresAt ?? null,
    timeoutMinutes: settings.timeoutMinutes,
    backgroundSeconds: settings.backgroundSeconds,
    hasPin: Boolean(settings.pinHash),
    hasPassword: principal.hasPassword,
    recentLogin: principal.recentLogin,
    passkeys: passkeys.map(passkeySummary),
    pinLockedUntil: attempts.lockedUntil,
    pinAttemptsLeft: attempts.lockedUntil ? 0 : Math.min(MAX_PIN_ATTEMPTS, attempts.attemptsLeft),
    demo: principal.mode === 'demo',
  }
}
