import 'server-only'
/**
 * Persistance du verrou du coffre.
 *
 * - Supabase : client service_role (tables 0290 en écriture serveur uniquement),
 *   chaque requête filtrée par user_id issu de la session revalidée.
 * - Démo : mémoire du processus serveur (globalThis : partagée entre routes et
 *   rendu serveur, perdue au redémarrage). Code de démonstration 123456.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import {
  DEFAULT_BACKGROUND_SECONDS, DEFAULT_TIMEOUT_MINUTES, DEMO_PIN, LOCKOUT_BASE_SECONDS, LOCKOUT_MAX_SECONDS,
  MAX_PIN_ATTEMPTS, lockoutSeconds, type PasskeySummary,
} from './config'
import { hashPin } from './crypto'

export type Scope = 'pin' | 'password'

export type LockSettings = {
  enabled: boolean
  pinHash: string | null
  timeoutMinutes: number
  backgroundSeconds: number
  epoch: number
}

export type StoredPasskey = PasskeySummary & {
  credentialId: string
  publicKey: string
  counter: number
  transports: string[]
}

export type AttemptState = { lockedUntil: number | null; attemptsLeft: number }
/** Réservation d'un essai (m3) : `allowed` = l'essai peut être vérifié ; il est déjà compté. */
export type AttemptReservation = AttemptState & { allowed: boolean }

export type ChallengeKind = 'reg' | 'auth'

export interface VaultStore {
  getSettings(userId: string): Promise<LockSettings>
  updateSettings(userId: string, patch: Partial<LockSettings> & { bumpEpoch?: boolean }): Promise<LockSettings>
  listPasskeys(userId: string): Promise<StoredPasskey[]>
  findPasskey(userId: string, credentialId: string): Promise<StoredPasskey | null>
  addPasskey(userId: string, p: Omit<StoredPasskey, 'id' | 'createdAt' | 'lastUsedAt'>): Promise<PasskeySummary>
  markPasskeyUsed(userId: string, id: string, counter: number): Promise<void>
  deletePasskey(userId: string, id: string): Promise<boolean>
  getAttempts(userId: string, scope: Scope): Promise<AttemptState>
  registerFailure(userId: string, scope: Scope): Promise<AttemptState>
  /**
   * m3 (audit v3) : réserve atomiquement un essai AVANT la vérification (scrypt) ; l'essai
   * est compté comme un échec présumé, effacé par clearAttempts en cas de succès.
   */
  reserveAttempt(userId: string, scope: Scope): Promise<AttemptReservation>
  clearAttempts(userId: string, scope: Scope): Promise<void>
  /** m7 (audit v3) : défi WebAuthn conservé côté serveur ; renvoie son identifiant. */
  saveChallenge(userId: string, kind: ChallengeKind, challenge: string, name: string | null, ttlSeconds: number): Promise<string>
  /** Consomme le défi (usage unique) : null s'il est inconnu, expiré, d'un autre compte ou d'un autre type. */
  consumeChallenge(userId: string, kind: ChallengeKind, id: string): Promise<{ challenge: string; name: string | null } | null>
  /** Déverrouillage lié à la session Supabase (prédicat RLS vault_unlocked, phase 2). */
  recordUnlock(userId: string, sessionId: string | null, expiresAt: number): Promise<void>
  clearUnlock(userId: string, sessionId: string | null): Promise<void>
}

export const MAX_PASSKEYS = 10

const DEFAULTS: LockSettings = {
  enabled: true,
  pinHash: null,
  timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
  backgroundSeconds: DEFAULT_BACKGROUND_SECONDS,
  epoch: 0,
}

/* ------------------------------------------------------------------ */
/* Démo                                                                */
/* ------------------------------------------------------------------ */

type DemoAttempt = { failed: number; lockouts: number; lockedUntil: number | null }
type DemoChallenge = { userId: string; kind: ChallengeKind; challenge: string; name: string | null; expiresAt: number }
type DemoState = {
  settings: Map<string, LockSettings>
  passkeys: Map<string, StoredPasskey[]>
  attempts: Map<string, DemoAttempt>
  challenges?: Map<string, DemoChallenge>
  demoPinHash: Promise<string> | null
}

const g = globalThis as typeof globalThis & { __lpVaultLockDemo?: DemoState }
function demoState(): DemoState {
  g.__lpVaultLockDemo ??= { settings: new Map(), passkeys: new Map(), attempts: new Map(), challenges: new Map(), demoPinHash: null }
  // État créé avant cette version (rechargement à chaud) : complété.
  g.__lpVaultLockDemo.challenges ??= new Map()
  return g.__lpVaultLockDemo
}

const demoStore: VaultStore = {
  async getSettings(userId) {
    const st = demoState()
    let s = st.settings.get(userId)
    if (!s) {
      st.demoPinHash ??= hashPin(DEMO_PIN)
      s = { ...DEFAULTS, pinHash: await st.demoPinHash }
      st.settings.set(userId, s)
    }
    return { ...s }
  },
  async updateSettings(userId, patch) {
    const current = await this.getSettings(userId)
    const { bumpEpoch, ...rest } = patch
    const next = { ...current, ...rest, epoch: current.epoch + (bumpEpoch ? 1 : 0) }
    demoState().settings.set(userId, next)
    return { ...next }
  },
  async listPasskeys(userId) {
    return [...(demoState().passkeys.get(userId) ?? [])]
  },
  async findPasskey(userId, credentialId) {
    return (demoState().passkeys.get(userId) ?? []).find((p) => p.credentialId === credentialId) ?? null
  },
  async addPasskey(userId, p) {
    const list = demoState().passkeys.get(userId) ?? []
    const rec: StoredPasskey = { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString(), lastUsedAt: null }
    demoState().passkeys.set(userId, [...list, rec])
    return toSummary(rec)
  },
  async markPasskeyUsed(userId, id, counter) {
    const list = demoState().passkeys.get(userId) ?? []
    demoState().passkeys.set(userId, list.map((p) => (p.id === id ? { ...p, counter, lastUsedAt: new Date().toISOString() } : p)))
  },
  async deletePasskey(userId, id) {
    const list = demoState().passkeys.get(userId) ?? []
    const next = list.filter((p) => p.id !== id)
    demoState().passkeys.set(userId, next)
    return next.length !== list.length
  },
  async getAttempts(userId, scope) {
    const a = demoState().attempts.get(`${userId}:${scope}`)
    if (!a) return { lockedUntil: null, attemptsLeft: MAX_PIN_ATTEMPTS }
    const locked = a.lockedUntil && a.lockedUntil > Date.now() ? a.lockedUntil : null
    return { lockedUntil: locked, attemptsLeft: locked ? 0 : MAX_PIN_ATTEMPTS - a.failed }
  },
  async registerFailure(userId, scope) {
    const key = `${userId}:${scope}`
    const a = demoState().attempts.get(key) ?? { failed: 0, lockouts: 0, lockedUntil: null }
    if (a.lockedUntil && a.lockedUntil <= Date.now()) { a.lockedUntil = null; a.failed = 0 }
    a.failed += 1
    if (a.failed >= MAX_PIN_ATTEMPTS) {
      a.lockouts += 1
      a.failed = 0
      a.lockedUntil = Date.now() + lockoutSeconds(a.lockouts) * 1000
    }
    demoState().attempts.set(key, a)
    return { lockedUntil: a.lockedUntil, attemptsLeft: a.lockedUntil ? 0 : MAX_PIN_ATTEMPTS - a.failed }
  },
  async reserveAttempt(userId, scope) {
    // Synchrone entre deux await : atomique dans le processus (mémoire de démonstration).
    const key = `${userId}:${scope}`
    const a = demoState().attempts.get(key) ?? { failed: 0, lockouts: 0, lockedUntil: null }
    if (a.lockedUntil && a.lockedUntil > Date.now()) return { allowed: false, lockedUntil: a.lockedUntil, attemptsLeft: 0 }
    if (a.lockedUntil) { a.lockedUntil = null; a.failed = 0 }
    a.failed += 1
    if (a.failed >= MAX_PIN_ATTEMPTS) {
      a.lockouts += 1
      a.failed = 0
      a.lockedUntil = Date.now() + lockoutSeconds(a.lockouts) * 1000
    }
    demoState().attempts.set(key, a)
    return { allowed: true, lockedUntil: a.lockedUntil, attemptsLeft: a.lockedUntil ? 0 : MAX_PIN_ATTEMPTS - a.failed }
  },
  async clearAttempts(userId, scope) {
    demoState().attempts.delete(`${userId}:${scope}`)
  },
  async saveChallenge(userId, kind, challenge, name, ttlSeconds) {
    const map = demoState().challenges!
    for (const [id, c] of map) if ((c.userId === userId && c.kind === kind) || c.expiresAt <= Date.now()) map.delete(id)
    const id = crypto.randomUUID()
    map.set(id, { userId, kind, challenge, name, expiresAt: Date.now() + ttlSeconds * 1000 })
    return id
  },
  async consumeChallenge(userId, kind, id) {
    const map = demoState().challenges!
    const c = map.get(id)
    if (!c || c.userId !== userId || c.kind !== kind) return null
    map.delete(id)
    return c.expiresAt > Date.now() ? { challenge: c.challenge, name: c.name } : null
  },
  async recordUnlock() { /* sans objet en démo */ },
  async clearUnlock() { /* sans objet en démo */ },
}

function toSummary(p: StoredPasskey): PasskeySummary {
  return { id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, synced: p.synced, simulated: p.simulated }
}
export { toSummary as passkeySummary }

/* ------------------------------------------------------------------ */
/* Supabase (service_role)                                             */
/* ------------------------------------------------------------------ */

type SettingsRow = { enabled: boolean; pin_hash: string | null; timeout_minutes: number; background_seconds: number; epoch: number }
type PasskeyRow = {
  id: string; credential_id: string; public_key: string; counter: number | string; transports: string[] | null
  device_type: 'singleDevice' | 'multiDevice'; backed_up: boolean; name: string; created_at: string; last_used_at: string | null
}
type AttemptRow = { failed_count: number; locked_until: string | null }

const PASSKEY_COLUMNS = 'id, credential_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at'

function svc(): SupabaseClient {
  // Tables 0290 absentes de lib/supabase/types.ts : client non typé.
  return createServiceClient() as unknown as SupabaseClient
}

function fail(op: string, error: { code?: string } | null): never {
  console.warn(`[vault-lock] ${op} a échoué (code ${error?.code ?? 'inconnu'})`)
  throw new Error(`vault-lock:${op}:${error?.code ?? 'unknown'}`)
}

function fromPasskeyRow(r: PasskeyRow): StoredPasskey {
  return {
    id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at,
    synced: r.device_type === 'multiDevice' || r.backed_up,
    credentialId: r.credential_id, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports ?? [],
  }
}

const liveStore: VaultStore = {
  async getSettings(userId) {
    const { data, error } = await svc().from('vault_lock_settings')
      .select('enabled, pin_hash, timeout_minutes, background_seconds, epoch').eq('user_id', userId).maybeSingle()
    if (error) fail('settings.get', error)
    const r = data as SettingsRow | null
    if (!r) return { ...DEFAULTS }
    return { enabled: r.enabled, pinHash: r.pin_hash, timeoutMinutes: r.timeout_minutes, backgroundSeconds: r.background_seconds, epoch: r.epoch }
  },
  async updateSettings(userId, patch) {
    const current = await this.getSettings(userId)
    const { bumpEpoch, ...rest } = patch
    const next = { ...current, ...rest, epoch: current.epoch + (bumpEpoch ? 1 : 0) }
    const row: Record<string, unknown> = {
      user_id: userId, enabled: next.enabled, pin_hash: next.pinHash, timeout_minutes: next.timeoutMinutes,
      background_seconds: next.backgroundSeconds, epoch: next.epoch,
    }
    if ('pinHash' in rest) row.pin_updated_at = rest.pinHash ? new Date().toISOString() : null
    const { error } = await svc().from('vault_lock_settings').upsert(row, { onConflict: 'user_id' })
    if (error) fail('settings.update', error)
    return next
  },
  async listPasskeys(userId) {
    const { data, error } = await svc().from('vault_passkeys').select(PASSKEY_COLUMNS)
      .eq('user_id', userId).order('created_at', { ascending: true }).limit(MAX_PASSKEYS)
    if (error) fail('passkeys.list', error)
    return ((data ?? []) as PasskeyRow[]).map(fromPasskeyRow)
  },
  async findPasskey(userId, credentialId) {
    const { data, error } = await svc().from('vault_passkeys').select(PASSKEY_COLUMNS)
      .eq('user_id', userId).eq('credential_id', credentialId).maybeSingle()
    if (error) fail('passkeys.find', error)
    return data ? fromPasskeyRow(data as PasskeyRow) : null
  },
  async addPasskey(userId, p) {
    const { data, error } = await svc().from('vault_passkeys').insert({
      user_id: userId, credential_id: p.credentialId, public_key: p.publicKey, counter: p.counter,
      transports: p.transports, device_type: p.synced ? 'multiDevice' : 'singleDevice', backed_up: p.synced, name: p.name,
    }).select(PASSKEY_COLUMNS).single()
    if (error) fail('passkeys.add', error)
    return toSummary(fromPasskeyRow(data as PasskeyRow))
  },
  async markPasskeyUsed(userId, id, counter) {
    const { error } = await svc().from('vault_passkeys')
      .update({ counter, last_used_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id)
    if (error) fail('passkeys.used', error)
  },
  async deletePasskey(userId, id) {
    const { data, error } = await svc().from('vault_passkeys').delete().eq('user_id', userId).eq('id', id).select('id')
    if (error) fail('passkeys.delete', error)
    return (data ?? []).length > 0
  },
  async getAttempts(userId, scope) {
    const { data, error } = await svc().from('vault_lock_attempts')
      .select('failed_count, locked_until').eq('user_id', userId).eq('scope', scope).maybeSingle()
    if (error) fail('attempts.get', error)
    const r = data as AttemptRow | null
    if (!r) return { lockedUntil: null, attemptsLeft: MAX_PIN_ATTEMPTS }
    const until = r.locked_until ? Date.parse(r.locked_until) : null
    const locked = until && until > Date.now() ? until : null
    // Blocage expiré : le prochain échec repart de 1 (géré par vault_register_failure).
    return { lockedUntil: locked, attemptsLeft: locked ? 0 : until ? MAX_PIN_ATTEMPTS : Math.max(0, MAX_PIN_ATTEMPTS - r.failed_count) }
  },
  async registerFailure(userId, scope) {
    const { data, error } = await svc().rpc('vault_register_failure', {
      p_user_id: userId, p_scope: scope, p_max: MAX_PIN_ATTEMPTS, p_base: LOCKOUT_BASE_SECONDS, p_cap: LOCKOUT_MAX_SECONDS,
    })
    if (error) fail('attempts.fail', error)
    const r = (Array.isArray(data) ? data[0] : data) as { locked_until: string | null; attempts_left: number } | undefined
    const until = r?.locked_until ? Date.parse(r.locked_until) : null
    return { lockedUntil: until && until > Date.now() ? until : null, attemptsLeft: r?.attempts_left ?? 0 }
  },
  async reserveAttempt(userId, scope) {
    // RPC 0360 : verrou de ligne, incrément AVANT la vérification (aucune course possible).
    const { data, error } = await svc().rpc('vault_reserve_attempt', {
      p_user_id: userId, p_scope: scope, p_max: MAX_PIN_ATTEMPTS, p_base: LOCKOUT_BASE_SECONDS, p_cap: LOCKOUT_MAX_SECONDS,
    })
    if (error) fail('attempts.reserve', error)
    const r = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; locked_until: string | null; attempts_left: number } | undefined
    if (!r) fail('attempts.reserve', null)
    const until = r.locked_until ? Date.parse(r.locked_until) : null
    return { allowed: r.allowed === true, lockedUntil: until && until > Date.now() ? until : null, attemptsLeft: r.attempts_left ?? 0 }
  },
  async clearAttempts(userId, scope) {
    const { error } = await svc().from('vault_lock_attempts').delete().eq('user_id', userId).eq('scope', scope)
    if (error) fail('attempts.clear', error)
  },
  async saveChallenge(userId, kind, challenge, name, ttlSeconds) {
    const { data, error } = await svc().rpc('vault_issue_webauthn_challenge', {
      p_user_id: userId, p_kind: kind, p_challenge: challenge, p_name: name, p_ttl_seconds: ttlSeconds,
    })
    if (error || typeof data !== 'string') fail('challenge.save', error)
    return data as string
  },
  async consumeChallenge(userId, kind, id) {
    const { data, error } = await svc().rpc('vault_consume_webauthn_challenge', { p_id: id, p_user_id: userId, p_kind: kind })
    if (error) fail('challenge.consume', error)
    const r = (Array.isArray(data) ? data[0] : data) as { challenge: string; name: string | null } | undefined
    return r?.challenge ? { challenge: r.challenge, name: r.name ?? null } : null
  },
  async recordUnlock(userId, sessionId, expiresAt) {
    // Phase 2 (0370) : vault_unlocked() exige le claim session_id du JWT. Sans lui, la base
    // resterait fermée : on refuse le déverrouillage plutôt que d'annoncer un faux succès.
    if (!sessionId) fail('unlocks.record.no_session', null)
    const { error } = await svc().from('vault_unlocks').upsert(
      { user_id: userId, session_id: sessionId, expires_at: new Date(expiresAt).toISOString() },
      { onConflict: 'user_id,session_id' },
    )
    if (error) fail('unlocks.record', error)
  },
  async clearUnlock(userId, sessionId) {
    if (!sessionId) return
    const { error } = await svc().from('vault_unlocks').delete().eq('user_id', userId).eq('session_id', sessionId)
    if (error) console.warn(`[vault-lock] unlocks.clear a échoué (code ${error.code ?? 'inconnu'})`)
  },
}

export function vaultStore(mode: 'live' | 'demo'): VaultStore {
  return mode === 'live' ? liveStore : demoStore
}
