'use client'
/**
 * Appels navigateur vers /api/vault-lock/**. Le cookie de session coffre est HttpOnly :
 * le navigateur ne le lit jamais, il ne fait que le transporter (same-origin).
 */
import { VAULT_API, type VaultStatus } from '@/lib/vault-lock/config'
import { createCredential, getAssertion } from './webauthn-browser'

export class VaultApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { lockedUntil?: number | null; attemptsLeft?: number } = {},
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${VAULT_API}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new VaultApiError(0, 'network', 'Connexion impossible. Vérifiez votre réseau.')
  }
  if (res.status === 204) return undefined as T
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string; details?: VaultApiError['details'] } }
    | null
  if (!res.ok || !body || (body as { error?: unknown }).error) {
    const e = (body as { error?: { code: string; message: string; details?: VaultApiError['details'] } } | null)?.error
    throw new VaultApiError(res.status, e?.code ?? 'server_error', e?.message ?? 'Une erreur est survenue. Réessayez.', e?.details ?? {})
  }
  return body as T
}

type StatusBody = { status: VaultStatus }
const post = <T,>(path: string, json?: unknown) => call<T>(path, { method: 'POST', json: json ?? {} })

export const vaultApi = {
  status: () => call<StatusBody>('/status').then((b) => b.status),
  unlockPin: (pin: string) => post<StatusBody>('/unlock', { method: 'pin', pin }).then((b) => b.status),
  unlockPassword: (password: string) => post<StatusBody>('/unlock', { method: 'password', password }).then((b) => b.status),
  touch: () => post<{ expiresAt: number | null }>('/touch'),
  lock: () => call<void>('/lock', { method: 'POST', keepalive: true }),
  /** Variante pour `visibilitychange` / `pagehide` : survit à la mise en arrière-plan. */
  lockBeacon: () => {
    try {
      if (navigator.sendBeacon?.(`${VAULT_API}/lock`)) return
    } catch { /* repli fetch */ }
    void call<void>('/lock', { method: 'POST', keepalive: true }).catch(() => undefined)
  },
  updateSettings: (patch: { enabled?: boolean; timeoutMinutes?: number; backgroundSeconds?: number }) =>
    call<StatusBody>('/settings', { method: 'PATCH', json: patch }).then((b) => b.status),
  setPin: (input: { pin: string; currentPin?: string; password?: string }) =>
    call<StatusBody>('/pin', { method: 'PUT', json: input }).then((b) => b.status),
  deletePin: () => call<StatusBody>('/pin', { method: 'DELETE' }).then((b) => b.status),
  deletePasskey: (id: string) => call<StatusBody>(`/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((b) => b.status),

  /** Enregistre l'empreinte / le visage de cet appareil (cérémonie WebAuthn complète). */
  async registerPasskey(name: string): Promise<VaultStatus> {
    const { options } = await post<{ options: unknown }>('/webauthn/register/options', { name })
    const response = await createCredential(options)
    return (await post<StatusBody>('/webauthn/register/verify', { response })).status
  },
  /** Déverrouille avec l'empreinte / le visage. */
  async authenticatePasskey(): Promise<VaultStatus> {
    const { options } = await post<{ options: unknown }>('/webauthn/authenticate/options')
    const response = await getAssertion(options)
    return (await post<StatusBody>('/webauthn/authenticate/verify', { response })).status
  },
  /** Démonstration uniquement. */
  simulateRegister: (name: string) => post<StatusBody>('/webauthn/simulate', { action: 'register', name }).then((b) => b.status),
  simulateAuthenticate: () => post<StatusBody>('/webauthn/simulate', { action: 'authenticate' }).then((b) => b.status),
}

/** Le serveur ne sait pas (encore) faire du WebAuthn : bibliothèque absente, RP non configuré. */
export function isWebauthnServerUnavailable(e: unknown): boolean {
  return e instanceof VaultApiError && (e.status === 500 || e.status === 404 || e.status === 501 || e.status === 503)
}
