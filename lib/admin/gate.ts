// Accès masqué à l'administration : sans un cookie de « porte » posé par un lien secret,
// /admin ET /console répondent « page introuvable » (404) pour tout le monde. Ce n'est PAS
// l'authentification : le rôle admin (RPC is_admin) reste exigé par-dessus (voir middleware.ts).
// C'est une couche d'obscurité en plus, pour qu'un scanner ne découvre jamais l'existence de l'admin.
//
// Parcours : le lien secret /console/<secret> pose le cookie puis renvoie vers /console, le
// formulaire de connexion DÉDIÉ à l'administration (isolé de la connexion des parents). Après
// connexion, l'admin arrive sur /admin.
//
// Compatible Edge (middleware) : Web Crypto uniquement, aucune dépendance Node.
//
// Configuration (production) : ADMIN_GATE_SECRET (lien d'entrée) + APP_ENCRYPTION_KEY (signe le cookie).
// Sans ADMIN_GATE_SECRET, la porte est inactive et /admin se comporte normalement (démo, local).

export const ADMIN_ENTRY_PREFIX = '/console/'
/** Page de connexion dédiée à l'administration (derrière la porte, isolée des parents). */
export const ADMIN_LOGIN_PATH = '/console'
const GATE_COOKIE = 'lp_adm'
const enc = new TextEncoder()

export function adminGateConfigured(): boolean {
  return Boolean(process.env.ADMIN_GATE_SECRET && process.env.APP_ENCRYPTION_KEY)
}

/** Comparaison à temps constant (longueurs égales d'abord). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Preuve stockée dans le cookie : HMAC(APP_ENCRYPTION_KEY, "admin-gate:" + secret). Infalsifiable sans la clé. */
export async function adminGateProof(): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.APP_ENCRYPTION_KEY!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('admin-gate:' + process.env.ADMIN_GATE_SECRET!))
  return b64url(new Uint8Array(sig))
}

/** Le jeton du lien d'entrée correspond-il au secret ? */
export async function isValidAdminEntry(token: string): Promise<boolean> {
  const secret = process.env.ADMIN_GATE_SECRET
  return Boolean(secret) && timingSafeEqual(token, secret!)
}

/** Le cookie de porte est-il présent et valide ? */
export async function hasAdminGate(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !adminGateConfigured()) return false
  return timingSafeEqual(cookieValue, await adminGateProof())
}

export const ADMIN_GATE_COOKIE = GATE_COOKIE
