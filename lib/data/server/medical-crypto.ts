import 'server-only'
/**
 * Chiffrement applicatif AES-256-GCM des informations médicales des enfants
 * (children.infos_medicales) — cf. docs/SECURITY.md §2.2.
 *
 * - Clé maître : APP_ENCRYPTION_KEY (32 octets en base64), jamais en BDD.
 * - Clé dérivée par utilisateur : HKDF-SHA256(salt = user_id).
 * - IV aléatoire 12 octets, tag 16 octets.
 * - AAD = id de l'enfant : un ciphertext copié sur une autre ligne ne se
 *   déchiffre pas (intégrité de rattachement).
 * - Format JSONB : { ciphertext, iv, tag, v: 1 }.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string; v: number }

const VERSION = 1
const INFO = 'lien-parental:children.infos_medicales:v1'

function masterKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

export function medicalCryptoReady(): boolean {
  return masterKey() !== null
}

function userKey(userId: string): Buffer {
  const key = masterKey()
  if (!key) throw new Error('APP_ENCRYPTION_KEY missing or invalid')
  return Buffer.from(hkdfSync('sha256', key, Buffer.from(userId, 'utf8'), Buffer.from(INFO, 'utf8'), 32))
}

export function encryptMedical(userId: string, childId: string, data: unknown): EncryptedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', userKey(userId), iv)
  cipher.setAAD(Buffer.from(childId, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    v: VERSION,
  }
}

export function isEncryptedPayload(v: unknown): v is EncryptedPayload {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return typeof p.ciphertext === 'string' && typeof p.iv === 'string' && typeof p.tag === 'string' && typeof p.v === 'number'
}

export function decryptMedical(userId: string, childId: string, payload: EncryptedPayload): unknown {
  if (payload.v !== VERSION) throw new Error('Unsupported payload version')
  const decipher = createDecipheriv('aes-256-gcm', userKey(userId), Buffer.from(payload.iv, 'base64'))
  decipher.setAAD(Buffer.from(childId, 'utf8'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const clear = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()])
  return JSON.parse(clear.toString('utf8')) as unknown
}
