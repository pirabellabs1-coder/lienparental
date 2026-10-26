/**
 * Limiteur de débit : briques PURES (sans `server-only`, sans Supabase) afin
 * d'être testables avec node:test (tests/rate-limit.test.ts).
 * Ne pas importer côté client : utilise node:crypto et des secrets serveur.
 * Point d'entrée applicatif : lib/data/server/rate-limit.ts.
 */
import { createHmac } from 'node:crypto'

export type RateLimitResult =
  | { ok: true }
  /**
   * `limited`     : quota dépassé → 429 + Retry-After.
   * `unavailable` : limiteur partagé injoignable sur une route fail-closed → 503.
   */
  | { ok: false; retryAfter: number; reason: 'limited' | 'unavailable' }

// --- Adresse IP du client ----------------------------------------------------

const IP_CHARS = /^[0-9a-f.:]{2,45}$/

/**
 * Normalise une valeur d'en-tête en adresse IP plausible, sinon null.
 * Retire port et crochets (« 1.2.3.4:5678 », « [::1]:443 ») et le préfixe
 * IPv4-mappé (« ::ffff:1.2.3.4 »). Aucune résolution, aucune confiance : le
 * résultat ne sert qu'à compter et à hacher.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let v = raw.trim().toLowerCase()
  if (!v) return null
  const bracket = /^\[([0-9a-f:.]+)\](?::\d+)?$/.exec(v)
  if (bracket) v = bracket[1]!
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'))
  if (v.startsWith('::ffff:') && /^\d{1,3}(\.\d{1,3}){3}$/.test(v.slice(7))) v = v.slice(7)
  if (!IP_CHARS.test(v)) return null
  if (v.includes('.') && !v.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return null
  if (!v.includes('.') && !v.includes(':')) return null
  return v
}

/**
 * IP client telle que vue par la plateforme (Vercel), par ordre de confiance :
 *  1. `x-vercel-forwarded-for` : posé par l'edge Vercel, non falsifiable par le client ;
 *  2. `x-real-ip` : posé par Vercel (et par la plupart des reverse proxies) ;
 *  3. DERNIER saut de `x-forwarded-for` : ajouté par le proxy le plus proche.
 *     Le premier élément est fourni par le client et donc falsifiable : on ne
 *     l'utilise jamais (sinon un attaquant change de compteur à chaque requête).
 * Renvoie 'unknown' si rien d'exploitable (développement local).
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for')
  if (vercel) {
    const ip = normalizeIp(vercel.split(',')[0])
    if (ip) return ip
  }
  const real = normalizeIp(headers.get('x-real-ip'))
  if (real) return real
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const hops = fwd.split(',').map((s) => s.trim()).filter(Boolean)
    const ip = normalizeIp(hops[hops.length - 1])
    if (ip) return ip
  }
  return 'unknown'
}

/**
 * Regroupement de l'IP pour le comptage : une IPv4 telle quelle, une IPv6
 * ramenée à son /64 (un abonné dispose en général d'un /64 entier et peut
 * changer d'adresse à volonté à l'intérieur).
 */
export function ipBucket(ip: string): string {
  if (ip === 'unknown' || !ip.includes(':')) return ip
  const [head = '', tail] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail !== undefined && tail ? tail.split(':') : []
  const missing = tail !== undefined ? Math.max(0, 8 - left.length - right.length) : 0
  const groups = [...left, ...Array<string>(missing).fill('0'), ...right]
  return `${groups.slice(0, 4).map((g) => (g.replace(/^0+/, '') || '0')).join(':')}::/64`
}

// --- Empreintes (jamais d'IP ni de jeton en clair dans les clés) -------------

/**
 * Secret des empreintes de clés. IP_HASH_SALT en priorité (même sel que les
 * preuves d'IP), puis APP_ENCRYPTION_KEY, puis la clé service_role (toujours
 * présente quand le limiteur partagé est actif ; dérivée par HMAC, jamais
 * exposée). Sans aucun secret (démo locale), un sel propre au processus.
 */
let processSalt: string | null = null
function keySecret(): string {
  const s = process.env.IP_HASH_SALT || process.env.APP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (s) return s
  if (!processSalt) processSalt = `proc:${process.pid}:${Date.now()}:${Math.random()}`
  return processSalt
}

/** HMAC-SHA256 tronqué à 128 bits (32 hex) : suffisant pour un compteur, non réversible. */
export function fingerprint(value: string): string {
  return createHmac('sha256', keySecret()).update(`rl:${value}`).digest('hex').slice(0, 32)
}

const ACTION_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/

function assertAction(action: string): string {
  if (!ACTION_RE.test(action)) throw new Error(`rate-limit: action invalide « ${action} »`)
  return action
}

/** Clé par IP : `<action>:ip:<empreinte de l'IP (/64 en IPv6)>`. */
export function ipKey(action: string, ip: string): string {
  return `${assertAction(action)}:ip:${fingerprint(`ip:${ipBucket(ip)}`)}`
}

/** Clé par utilisateur authentifié (UUID, non sensible) : `<action>:u:<id>`. */
export function userKey(action: string, userId: string): string {
  return `${assertAction(action)}:u:${userId.slice(0, 64)}`
}

/** Clé par jeton public (témoin, partage) : `<action>:t:<empreinte du jeton>`. */
export function tokenKey(action: string, token: string): string {
  return `${assertAction(action)}:t:${fingerprint(`t:${token}`)}`
}

/**
 * Clé effectivement stockée en base : famille d'action en clair (exploitation,
 * statistiques) + empreinte de la clé logique complète. Filet de sécurité : même
 * si un appelant construit une clé contenant une IP ou un jeton bruts, rien de
 * tel n'atteint la table.
 */
export function storageKey(key: string): string {
  const family = (key.split(':')[0] ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'k'
  return `${family}:${fingerprint(`k:${key}`)}`
}

// --- Fenêtre fixe alignée sur l'epoch (identique côté SQL) -------------------

export function windowSeconds(windowMs: number): number {
  return Math.min(86_400, Math.max(1, Math.ceil(windowMs / 1000)))
}

/** Début de fenêtre (ms) : floor(now / w) * w, comme `rate_limit_hit` en SQL. */
export function windowStartMs(nowMs: number, windowSec: number): number {
  const w = windowSec * 1000
  return Math.floor(nowMs / w) * w
}

/** Secondes avant la prochaine fenêtre (≥ 1). */
export function retryAfterSeconds(nowMs: number, windowSec: number): number {
  const end = windowStartMs(nowMs, windowSec) + windowSec * 1000
  return Math.max(1, Math.ceil((end - nowMs) / 1000))
}

// --- Compteur mémoire (repli démo, filet local, échec fail-open) -------------

type Bucket = { count: number; resetAt: number }

export class MemoryLimiter {
  private readonly buckets = new Map<string, Bucket>()
  constructor(private readonly maxKeys = 10_000) {}

  private sweep(now: number) {
    if (this.buckets.size < this.maxKeys) return
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k)
    // Toujours plein : on vide (préférable à une croissance mémoire non bornée).
    if (this.buckets.size >= this.maxKeys) this.buckets.clear()
  }

  /** Incrémente puis indique si `limit` est dépassé (fenêtre ouverte au premier appel). */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    this.sweep(now)
    const b = this.buckets.get(key)
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs })
      return limit >= 1 ? { ok: true } : { ok: false, reason: 'limited', retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) }
    }
    b.count += 1
    if (b.count > limit) return { ok: false, reason: 'limited', retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
    return { ok: true }
  }

  get size() {
    return this.buckets.size
  }
}
