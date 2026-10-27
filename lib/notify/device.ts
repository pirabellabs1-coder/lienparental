/**
 * Empreinte d'appareil pour l'alerte « nouvelle connexion ».
 * Module PUR (node:crypto uniquement) : testé par tests/notify.test.ts.
 *
 * Identité principale : identifiant aléatoire signé dans un cookie HttpOnly (lp_did).
 * Repli faible (session découverte côté serveur, sans cookie) :
 * empreinte = HMAC-SHA256(sel, famille de navigateur | système | IP grossière).
 *  - pas de numéro de version : une mise à jour du navigateur ne déclenche pas d'alerte ;
 *  - IP grossière : IPv4 /16, IPv6 /48 (changements d'adresse fréquents chez un même opérateur) ;
 *  - aucune géolocalisation (pas de service tiers) : le lieu n'est jamais affiché.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type DeviceInfo = {
  /** « Chrome », « Safari », « Firefox »… */
  browser: string
  /** « Windows », « macOS », « iOS », « Android »… */
  os: string
  /** « Ordinateur », « iPhone », « iPad », « Téléphone Android »… */
  kind: string
  /** « Chrome sur Windows » (affiché à l'utilisateur, ≤ 80 caractères). */
  label: string
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = (ua ?? '').slice(0, 512)
  let browser = 'Navigateur'
  if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera'
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung Internet'
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox'
  else if (/Chrome\/|CriOS\/|Chromium\//.test(s)) browser = 'Chrome'
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'Safari'

  let os = 'système inconnu'
  let kind = 'Appareil'
  if (/iPhone|iPod/.test(s)) { os = 'iOS'; kind = 'iPhone' }
  else if (/iPad/.test(s)) { os = 'iPadOS'; kind = 'iPad' }
  else if (/Android/.test(s)) { os = 'Android'; kind = /Mobile/.test(s) ? 'Téléphone Android' : 'Tablette Android' }
  else if (/CrOS/.test(s)) { os = 'ChromeOS'; kind = 'Ordinateur' }
  else if (/Windows/.test(s)) { os = 'Windows'; kind = 'Ordinateur' }
  else if (/Macintosh|Mac OS X/.test(s)) { os = 'macOS'; kind = 'Ordinateur' }
  else if (/Linux/.test(s)) { os = 'Linux'; kind = 'Ordinateur' }

  return { browser, os, kind, label: `${browser} sur ${os}`.slice(0, 80) }
}

/** IPv4 → /16 (« 192.168.0.0/16 »), IPv6 → /48, inconnue → « unknown ». */
export function coarseIp(ip: string | null | undefined): string {
  const v = (ip ?? '').trim().toLowerCase()
  if (!v || v === 'unknown') return 'unknown'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    const [a, b] = v.split('.')
    return `${a}.${b}.0.0/16`
  }
  if (v.includes(':')) {
    const [head = '', tail] = v.split('::')
    const left = head ? head.split(':') : []
    const right = tail ? tail.split(':') : []
    const missing = tail !== undefined ? Math.max(0, 8 - left.length - right.length) : 0
    const groups = [...left, ...Array<string>(missing).fill('0'), ...right]
    return `${groups.slice(0, 3).map(g => g.replace(/^0+/, '') || '0').join(':')}::/48`
  }
  return 'unknown'
}

/**
 * Sel des empreintes et de la signature du cookie d'appareil : IP_HASH_SALT, à défaut
 * APP_ENCRYPTION_KEY. Jamais la clé service_role. Absent : détection désactivée.
 */
export function deviceSalt(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.IP_HASH_SALT || env.APP_ENCRYPTION_KEY || ''
  return s.length >= 16 ? s : null
}

// --- Identifiant d'appareil (cookie lp_did) ------------------------------------
// Identité PRINCIPALE d'un navigateur : 24 octets aléatoires, signés HMAC (le
// cookie ne peut pas être forgé pour se faire passer pour un appareil connu
// sans le sel serveur). HttpOnly, Secure, SameSite=Lax, 400 jours.

export const DEVICE_COOKIE = 'lp_did'
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 3600

const sig = (id: string, salt: string) => createHmac('sha256', salt).update(`did:v1:${id}`).digest('base64url').slice(0, 32)

export function newDeviceId(): string {
  return randomBytes(24).toString('base64url')
}

export function signDeviceId(id: string, salt: string): string {
  return `${id}.${sig(id, salt)}`
}

/** Identifiant si le cookie est bien signé, sinon null. Comparaison en temps constant. */
export function verifyDeviceCookie(value: string | null | undefined, salt: string): string | null {
  if (!value || value.length > 100) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [id, mac] = parts as [string, string]
  if (!/^[A-Za-z0-9_-]{32}$/.test(id) || !/^[A-Za-z0-9_-]{32}$/.test(mac)) return null
  const expected = Buffer.from(sig(id, salt))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return id
}

/** Empreinte stockée de l'identifiant d'appareil (jamais l'identifiant lui-même en base). */
export function deviceIdHash(id: string, salt: string): string {
  return createHmac('sha256', salt).update(`didh:v1:${id}`).digest('hex')
}

/** Empreinte hexadécimale (64 caractères) de l'appareil, ou null sans sel. */
export function deviceHash(ua: string | null | undefined, ip: string | null | undefined, salt: string | null): string | null {
  if (!salt) return null
  const d = parseUserAgent(ua)
  return createHmac('sha256', salt).update(`dev:v1:${d.browser}|${d.os}|${coarseIp(ip)}`).digest('hex')
}

/** « m***@gmail.com » (jamais l'adresse complète dans une notification). */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? '').trim()
  const at = e.indexOf('@')
  if (at <= 0 || at === e.length - 1) return 'une nouvelle adresse'
  return `${e[0]}***@${e.slice(at + 1)}`
}
