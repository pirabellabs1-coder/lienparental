import 'server-only'
/**
 * Chiffrement au repos des jetons Google (même approche que
 * lib/data/server/medical-crypto.ts) :
 *
 * - Clé maître : GOOGLE_TOKEN_ENCRYPTION_KEY (32 octets base64), à défaut
 *   APP_ENCRYPTION_KEY. Jamais en BDD.
 * - Séparation des clés : HKDF-SHA256 avec un `info` propre à Google, donc
 *   réutiliser APP_ENCRYPTION_KEY ne donne jamais la même clé que les
 *   données médicales. Sel = user_id (clé différente par utilisateur).
 * - AES-256-GCM, IV aléatoire 12 octets, tag 16 octets.
 * - AAD = `google:<usage>:<user_id>` : un jeton chiffré copié sur une autre
 *   ligne ou dans une autre colonne ne se déchiffre pas.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export type SealedPayload = { ciphertext: string; iv: string; tag: string; v: number }
export type TokenPurpose = 'refresh' | 'access'

const VERSION = 1
const INFO_TOKENS = 'lien-parental:google_connections:v1'
const INFO_STATE = 'lien-parental:google_oauth_state:v1'

function masterKey(): Buffer | null {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

export function tokenCryptoReady(): boolean {
  return masterKey() !== null
}

function derive(salt: string, info: string): Buffer {
  const key = masterKey()
  if (!key) throw new Error('Google token encryption key missing or invalid')
  return Buffer.from(hkdfSync('sha256', key, Buffer.from(salt, 'utf8'), Buffer.from(info, 'utf8'), 32))
}

export function sealToken(userId: string, purpose: TokenPurpose, token: string): SealedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derive(userId, INFO_TOKENS), iv)
  cipher.setAAD(Buffer.from(`google:${purpose}:${userId}`, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), v: VERSION }
}

export function isSealedPayload(v: unknown): v is SealedPayload {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return typeof p.ciphertext === 'string' && typeof p.iv === 'string' && typeof p.tag === 'string' && typeof p.v === 'number'
}

/** Lève une exception si le payload a été altéré, déplacé ou chiffré avec une autre clé. */
export function openToken(userId: string, purpose: TokenPurpose, payload: SealedPayload): string {
  if (payload.v !== VERSION) throw new Error('Unsupported payload version')
  const decipher = createDecipheriv('aes-256-gcm', derive(userId, INFO_TOKENS), Buffer.from(payload.iv, 'base64'))
  decipher.setAAD(Buffer.from(`google:${purpose}:${userId}`, 'utf8'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Cookie d'état OAuth (state + code_verifier PKCE + nonce) : chiffré ET
 * authentifié, donc ni lisible ni falsifiable côté navigateur.
 * Format : base64url(iv | tag | ciphertext).
 */
export function sealState(data: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derive('oauth-state', INFO_STATE), iv)
  cipher.setAAD(Buffer.from('google-oauth-state', 'utf8'))
  const ct = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')
}

export function openState(sealed: string): string | null {
  try {
    const buf = Buffer.from(sealed, 'base64url')
    if (buf.length < 29 || buf.length > 4096) return null
    const decipher = createDecipheriv('aes-256-gcm', derive('oauth-state', INFO_STATE), buf.subarray(0, 12))
    decipher.setAAD(Buffer.from('google-oauth-state', 'utf8'))
    decipher.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
