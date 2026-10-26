import 'server-only'
/**
 * OAuth 2.0 Google côté serveur (Authorization Code + PKCE S256), sans SDK.
 * https://developers.google.com/identity/protocols/oauth2/web-server
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { GoogleOAuthConfig } from './config'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const TIMEOUT_MS = 10_000

const b64url = (b: Buffer) => b.toString('base64url')

export function randomValue(bytes = 32): string {
  return b64url(randomBytes(bytes))
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

/** Comparaison en temps constant (state, nonce). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export function buildAuthorizationUrl(cfg: GoogleOAuthConfig, p: { state: string; verifier: string; nonce: string; scopes: string[] }): string {
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: p.scopes.join(' '),
    // Accès hors ligne : jeton de rafraîchissement pour synchroniser sans l'utilisateur.
    access_type: 'offline',
    // Garantit l'émission d'un refresh_token, même lors d'une reconnexion.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: p.state,
    nonce: p.nonce,
    code_challenge: pkceChallenge(p.verifier),
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

const tokenSchema = z.object({
  access_token: z.string().min(10).max(4096),
  expires_in: z.number().int().positive().max(86_400),
  refresh_token: z.string().min(10).max(1024).optional(),
  scope: z.string().max(1000).default(''),
  id_token: z.string().max(8192).optional(),
  token_type: z.string(),
})
export type TokenSet = z.infer<typeof tokenSchema>

export type TokenFailure = { ok: false; kind: 'revoked' | 'transient' | 'invalid' }

async function postForm(url: string, form: Record<string, string>): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return null // réseau / délai dépassé
  }
}

async function readTokens(res: Response | null): Promise<{ ok: true; tokens: TokenSet } | TokenFailure> {
  if (!res) return { ok: false, kind: 'transient' }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) return { ok: false, kind: 'transient' }
    const err = (body as { error?: unknown } | null)?.error
    // invalid_grant : code expiré/rejoué, ou refresh_token révoqué/expiré.
    return { ok: false, kind: err === 'invalid_grant' ? 'revoked' : 'invalid' }
  }
  const parsed = tokenSchema.safeParse(body)
  return parsed.success ? { ok: true, tokens: parsed.data } : { ok: false, kind: 'invalid' }
}

export async function exchangeCode(cfg: GoogleOAuthConfig, code: string, verifier: string) {
  return readTokens(await postForm(TOKEN_URL, {
    code, code_verifier: verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri, grant_type: 'authorization_code',
  }))
}

export async function refreshAccessToken(cfg: GoogleOAuthConfig, refreshToken: string) {
  return readTokens(await postForm(TOKEN_URL, {
    refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  }))
}

/** Révocation (au mieux) : invalide le refresh_token ET les access_tokens associés chez Google. */
export async function revokeToken(token: string): Promise<boolean> {
  const res = await postForm(REVOKE_URL, { token })
  // 400 invalid_token : déjà révoqué (l'utilisateur l'a fait chez Google) → objectif atteint.
  return Boolean(res && (res.ok || res.status === 400))
}

const idClaims = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string(),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  nonce: z.string().optional(),
  email: z.string().email().max(320).optional(),
  email_verified: z.boolean().optional(),
})

/**
 * Lecture de l'ID token reçu DIRECTEMENT du point de terminaison token de
 * Google (TLS, authentifié par client_secret) : OIDC Core §3.1.3.7 autorise
 * alors à se passer de la vérification de signature. On contrôle quand même
 * iss, aud, exp et nonce (rejeu).
 */
export function parseIdToken(cfg: GoogleOAuthConfig, idToken: string | undefined, nonce: string): { sub: string; email: string | null } | null {
  if (!idToken) return null
  const part = idToken.split('.')[1]
  if (!part) return null
  let json: unknown
  try { json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) } catch { return null }
  const c = idClaims.safeParse(json)
  if (!c.success) return null
  if (c.data.aud !== cfg.clientId) return null
  if (c.data.exp * 1000 < Date.now() - 60_000) return null
  if (!c.data.nonce || !safeEqual(c.data.nonce, nonce)) return null
  return { sub: c.data.sub, email: c.data.email && c.data.email_verified !== false ? c.data.email : null }
}
