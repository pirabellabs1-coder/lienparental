import 'server-only'
/**
 * Primitives cryptographiques du verrou (Node crypto uniquement, aucune dépendance).
 *
 * - Clé maîtresse : VAULT_LOCK_SECRET (repli APP_ENCRYPTION_KEY), ≥ 32 caractères.
 *   Deux sous-clés dérivées par HKDF (cookie, poivre du code) : jamais réutilisées.
 * - Code à 6 chiffres : scrypt(HMAC(poivre, code), sel 16 octets), N=2^15, r=8, p=1.
 *   Le poivre (hors base) rend une fuite de la seule base inexploitable par force brute
 *   hors ligne (10^6 combinaisons sinon). Changer la clé maîtresse invalide les codes :
 *   les parents les redéfinissent via le mot de passe du compte.
 * - Jetons (cookie de session coffre, défi WebAuthn) : HMAC-SHA256, comparaison en temps constant.
 */
import { createHmac, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { DEMO_MODE } from '@/lib/demo-auth'

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 }
// Valeur fixe, uniquement pour le mode démonstration (aucune donnée réelle).
const DEMO_SECRET = 'lien-parental-demo-only-vault-lock-secret-0000'

function scrypt(password: Buffer, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))))
}

/** Clé maîtresse, ou null si non configurée (le verrou échoue alors fermé). */
function masterSecret(): string | null {
  const s = process.env.VAULT_LOCK_SECRET || process.env.APP_ENCRYPTION_KEY || ''
  if (s.length >= 32) return s
  return DEMO_MODE ? DEMO_SECRET : null
}

export function vaultSecretConfigured(): boolean {
  return masterSecret() !== null
}

const derived = new Map<string, Buffer>()
function subKey(info: 'cookie' | 'pin-pepper'): Buffer {
  const master = masterSecret()
  if (!master) throw new Error('VAULT_LOCK_SECRET missing')
  // Les variables d'environnement ne changent pas à chaud : cache par usage.
  let k = derived.get(info)
  if (!k) {
    k = Buffer.from(hkdfSync('sha256', master, 'lien-parental/vault-lock', info, 32))
    derived.set(info, k)
  }
  return k
}

/* ------------------------------------------------------------------ */
/* Code à 6 chiffres                                                   */
/* ------------------------------------------------------------------ */

function peppered(pin: string): Buffer {
  return createHmac('sha256', subKey('pin-pepper')).update(pin, 'utf8').digest()
}

/** Format : scrypt$N$r$p$selB64$hashB64 (paramètres embarqués : ajustables plus tard). */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(peppered(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string]
  const N = Number(n), R = Number(r), P = Number(p)
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P) || N > 2 ** 17 || R > 16 || P > 4) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(peppered(pin), Buffer.from(saltB64, 'base64'), expected.length, { N, r: R, p: P, maxmem: SCRYPT.maxmem })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/* ------------------------------------------------------------------ */
/* Jetons signés                                                       */
/* ------------------------------------------------------------------ */

function mac(data: string): string {
  return createHmac('sha256', subKey('cookie')).update(data).digest('base64url')
}

/** v1.<charge utile base64url>.<signature> */
export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `v1.${body}.${mac(`v1.${body}`)}`
}

export function verifyToken<T>(token: string | undefined | null): T | null {
  if (!token || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const expected = Buffer.from(mac(`v1.${parts[1]}`))
  const given = Buffer.from(parts[2]!)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

/** Comparaison en temps constant de deux chaînes (mot de passe de démo). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest()
  const hb = createHmac('sha256', 'cmp').update(b).digest()
  return timingSafeEqual(ha, hb)
}
