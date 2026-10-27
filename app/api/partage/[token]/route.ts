/**
 * POST /api/partage/[token] — ouverture publique (sans compte) d'un partage avocat.
 * Corps : { code?: "123456" }
 *   200 { content, accessKey }        contenu en lecture seule
 *   401 { error, requiresCode: true } code requis
 *   403 { error, remaining }          code incorrect
 *   404                               lien inconnu, expiré ou révoqué (indistincts)
 *   429                               trop de tentatives (5 / 15 min / jeton, 20 codes / 15 min / IP) ou de requêtes
 *   503                               service ou limiteur partagé indisponible (fail-closed)
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { jsonError } from '@/lib/data/server/http'
import { clientIp, ipKey, rateLimit, rateLimitedResponse } from '@/lib/data/server/rate-limit'
import {
  buildShareContent, clearFailures, issueAccessKey, lockedFor, logAccess, recentDbFailures, registerFailure, resolveShare,
  SHARE_LOCK_SECONDS, SHARE_MAX_FAILS, TOKEN_RE, verifyAccessCode,
} from '../_lib/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...HEADERS, ...extra } })
}


export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const t = await getTranslations('server.partage')
  const NOT_FOUND = { error: { code: 'not_found', message: t('linkInvalid') } }

  // Barrière générale par IP (balayage de jetons), partagée entre instances.
  // Fail-closed : 503 si le compteur partagé est indisponible.
  const flood = await rateLimit(ipKey('partage:open', clientIp(req.headers)), 60, 15 * 60_000, { failClosed: true })
  if (!flood.ok) return rateLimitedResponse(flood, t('tooManyRequests'), HEADERS)

  if (!TOKEN_RE.test(token)) return json(NOT_FOUND, 404)

  const locked = lockedFor(token)
  if (locked > 0) {
    return json(
      { error: { code: 'locked', message: t('lockedMinutes', { minutes: Math.ceil(locked / 60) }) }, retryAfter: locked },
      429,
      { 'Retry-After': String(locked) },
    )
  }

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : ''

  let share
  try {
    share = await resolveShare(token)
  } catch {
    return jsonError(503, 'unavailable', t('serviceUnavailable'), HEADERS)
  }
  if (!share) return json(NOT_FOUND, 404)

  const ua = req.headers.get('user-agent')

  if (share.accessCodeHash) {
    // Verrou partagé (base) : 5 échecs consécutifs en 15 min, toutes instances confondues.
    const dbFails = await recentDbFailures(share.id)
    if (dbFails >= SHARE_MAX_FAILS) {
      return json(
        { error: { code: 'locked', message: t('lockedMinutes', { minutes: 15 }) }, retryAfter: SHARE_LOCK_SECONDS },
        429,
        { 'Retry-After': String(SHARE_LOCK_SECONDS) },
      )
    }
    if (!code) {
      return json({ error: { code: 'code_required', message: t('codeRequired') }, requiresCode: true }, 401)
    }
    // Saisies de code par IP, tous partages confondus (le verrou ci-dessus est par partage).
    const codeTries = await rateLimit(ipKey('partage:code', clientIp(req.headers)), 20, 15 * 60_000, { failClosed: true })
    if (!codeTries.ok) return rateLimitedResponse(codeTries, t('tooManyAttempts'), HEADERS)
    const valid = /^\d{6}$/.test(code) && (await verifyAccessCode(code, share.accessCodeHash))
    if (!valid) {
      const remaining = Math.min(registerFailure(token), Math.max(0, SHARE_MAX_FAILS - (dbFails + 1)))
      await logAccess(share, ua, false)
      if (remaining === 0) {
        return json({ error: { code: 'locked', message: t('lockedMinutes', { minutes: 15 }) }, retryAfter: 900 }, 429, { 'Retry-After': '900' })
      }
      return json(
        { error: { code: 'bad_code', message: t('badCode', { remaining }) }, remaining, requiresCode: true },
        403,
      )
    }
    clearFailures(token)
  }

  await logAccess(share, ua, true)
  const content = await buildShareContent(share)
  return json({ content, accessKey: issueAccessKey(token) }, 200)
}
