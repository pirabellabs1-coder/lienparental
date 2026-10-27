import 'server-only'
/**
 * Garde-fous communs des routes /api/vault-lock/** :
 * - même origine (anti-CSRF, en plus de SameSite) : Origin, sinon Sec-Fetch-Site ;
 * - corps JSON borné (taille, Content-Type) puis validé par zod ;
 * - limitation de débit par utilisateur, partagée entre instances et fail-closed
 *   (en plus du blocage progressif persistant).
 */
import type { z } from 'zod'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, rateLimitedResponse, userKey } from '@/lib/data/server/rate-limit'
import { getTranslations } from 'next-intl/server'
import { libT } from '@/lib/i18n/runtime'
import { resolvePrincipal, type VaultPrincipal } from './context'

/**
 * Traducteur `shared.vaultLock` dans la langue de la requête (cookie) ; hors requête ou en cas
 * d'échec, français (jamais d'exception : ces chemins sont fail-closed).
 */
export async function vaultLockT(): Promise<(key: string) => string> {
  try {
    const t = await getTranslations('shared.vaultLock')
    return (key: string) => t(key as never)
  } catch {
    const t = libT('shared.vaultLock', 'fr')
    return (key: string) => t(key)
  }
}

const MAX_BODY_BYTES = 16 * 1024

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  // Pas d'Origin (rare sur POST) : on exige l'en-tête Fetch Metadata.
  return req.headers.get('sec-fetch-site') === 'same-origin'
}

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  const t = await vaultLockT()
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, res: jsonError(415, 'unsupported_media_type', t('invalidRequest')) }
  }
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > MAX_BODY_BYTES) return { ok: false, res: jsonError(413, 'payload_too_large', t('payloadTooLarge')) }
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return { ok: false, res: jsonError(400, 'invalid_body', t('invalidRequest')) }
  }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, res: jsonError(413, 'payload_too_large', t('payloadTooLarge')) }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, res: jsonError(400, 'invalid_json', t('invalidRequest')) }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    return { ok: false, res: jsonError(422, 'validation_failed', msg && !msg.startsWith('Expected') && !msg.startsWith('Required') ? msg : t('invalidData')) }
  }
  return { ok: true, data: parsed.data }
}

/**
 * Préambule de chaque route mutante : même origine, identité serveur, débit.
 * `limit` requêtes par minute et par utilisateur.
 */
export async function guardMutation(req: Request, bucket: string, limit = 30): Promise<{ ok: true; principal: VaultPrincipal } | { ok: false; res: Response }> {
  if (!isSameOrigin(req)) return { ok: false, res: jsonError(403, 'forbidden_origin', (await vaultLockT())('forbiddenOrigin')) }
  return guardRead(bucket, limit)
}

export async function guardRead(bucket: string, limit = 60): Promise<{ ok: true; principal: VaultPrincipal } | { ok: false; res: Response }> {
  const p = await resolvePrincipal()
  if (!p.ok) {
    const t = await vaultLockT()
    if (p.reason === 'not_configured') return { ok: false, res: jsonError(503, 'not_configured', t('notConfigured')) }
    if (p.reason === 'mfa_required') return { ok: false, res: jsonError(403, 'mfa_required', t('mfaRequired')) }
    return { ok: false, res: jsonError(401, 'unauthenticated', t('sessionExpired')) }
  }
  // Fail-closed : sans compteur partagé, le déverrouillage serait brute-forçable instance par instance.
  const rl = await rateLimit(userKey(`vault-lock:${bucket}`, p.userId), limit, 60_000, { failClosed: true })
  if (!rl.ok) return { ok: false, res: await rateLimitedResponse(rl, (await vaultLockT())('tooManyAttempts')) }
  return { ok: true, principal: p }
}

export async function serverError() {
  return jsonError(500, 'server_error', (await getTranslations('server.common'))('serverError'))
}
