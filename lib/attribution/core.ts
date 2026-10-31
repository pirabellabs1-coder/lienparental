// Attribution des inscriptions aux campagnes (UTM) : logique PURE, partagée par le middleware
// (Edge), le serveur et les tests.
//
// - Seuls les paramètres de campagne utm_* sont lus, jamais d'identifiant publicitaire
//   (gclid, fbclid, ttclid…) : aucune donnée de suivi tierce n'est conservée.
// - Cookie first-party `lp_attr`, 30 jours : premier contact (f) et dernier contact (l).
// - Rattaché au compte UNE fois, à l'inscription (record_signup_attribution, 0620), puis effacé.

export const ATTR_COOKIE = 'lp_attr'
export const ATTR_MAX_AGE = 30 * 24 * 60 * 60

export type Touch = {
  /** utm_source, utm_medium, utm_campaign, utm_content, utm_term */
  s: string; m?: string; c?: string; t?: string; k?: string
  /** Page d'arrivée (chemin sans paramètres) */
  p: string
  /** Domaine du site référent, s'il est externe */
  r?: string
  /** Horodatage (secondes) */
  at: number
}
export type Attribution = { f: Touch; l: Touch }

const FIELDS = [['s', 'utm_source'], ['m', 'utm_medium'], ['c', 'utm_campaign'], ['t', 'utm_content'], ['k', 'utm_term']] as const

/** Valeur de campagne nettoyée : lettres, chiffres et ponctuation simple, 100 caractères au plus. */
export function cleanValue(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const out = v.normalize('NFC').replace(/[^\p{L}\p{N} _.\-+~:|/]/gu, '').trim().slice(0, 100)
  return out || undefined
}

function cleanPath(p: string): string {
  return (p.split('?')[0] ?? '/').replace(/[^\p{L}\p{N}_.\-~/]/gu, '').slice(0, 200) || '/'
}

function refHost(referer: string | null, ownHost: string): string | undefined {
  if (!referer) return undefined
  try {
    const h = new URL(referer).hostname.toLowerCase()
    return h && h !== ownHost.toLowerCase() ? h.slice(0, 100) : undefined
  } catch {
    return undefined
  }
}

/** Contact de campagne d'une arrivée sur le site ; null sans utm_source (visite non attribuable). */
export function touchFromUrl(url: URL, referer: string | null, nowMs = Date.now()): Touch | null {
  const vals: Partial<Record<'s' | 'm' | 'c' | 't' | 'k', string>> = {}
  for (const [k, name] of FIELDS) {
    const v = cleanValue(url.searchParams.get(name))
    if (v) vals[k] = v
  }
  if (!vals.s) return null
  const touch: Touch = { s: vals.s, p: cleanPath(url.pathname), at: Math.floor(nowMs / 1000) }
  for (const k of ['m', 'c', 't', 'k'] as const) if (vals[k]) touch[k] = vals[k]
  const r = refHost(referer, url.hostname)
  if (r) touch.r = r
  return touch
}

function isTouch(x: unknown): x is Touch {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  if (typeof t.s !== 'string' || !t.s || typeof t.p !== 'string' || typeof t.at !== 'number' || !Number.isFinite(t.at)) return false
  return ['m', 'c', 't', 'k', 'r'].every((k) => t[k] === undefined || (typeof t[k] === 'string' && (t[k] as string).length <= 100))
}

/** Lecture tolérante du cookie (valeur absente, tronquée ou falsifiée : null). */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw || raw.length > 2000) return null
  try {
    const v = JSON.parse(raw) as { f?: unknown; l?: unknown }
    return isTouch(v.f) && isTouch(v.l) ? { f: v.f, l: v.l } : null
  } catch {
    return null
  }
}

/** Nouveau contact : le premier est conservé, le dernier remplacé. */
export function mergeAttribution(current: Attribution | null, touch: Touch): Attribution {
  return { f: current?.f ?? touch, l: touch }
}

export function serializeAttribution(a: Attribution): string {
  return JSON.stringify(a)
}
