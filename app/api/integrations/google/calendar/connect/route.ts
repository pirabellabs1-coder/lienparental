/**
 * POST /api/integrations/google/calendar/connect  { target: 'dedicated' | 'primary' }
 * Démarre l'autorisation OAuth Google (Authorization Code + PKCE S256).
 * Pose un cookie HttpOnly chiffré (state, code_verifier, nonce, utilisateur, cible ; 10 min)
 * et renvoie l'URL d'autorisation Google vers laquelle le navigateur se rend.
 */
import { getTranslations } from 'next-intl/server'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { CALLBACK_PATH, STATE_COOKIE, STATE_TTL_S, googleCalendarConfigured, googleOAuthConfig, scopesFor } from '@/lib/integrations/google/config'
import { sealState } from '@/lib/integrations/google/crypto'
import { crossSite, guard, sameOrigin } from '@/lib/integrations/google/http'
import { buildAuthorizationUrl, randomValue } from '@/lib/integrations/google/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ target: z.enum(['dedicated', 'primary']).default('dedicated') }).strict()

export async function POST(req: NextRequest) {
  const t = await getTranslations('server.google')
  if (!sameOrigin(req)) return crossSite()
  const ctx = await guard()
  if (ctx.kind === 'denied') return ctx.response
  const cfg = googleOAuthConfig()
  if (ctx.kind === 'demo' || !cfg || !googleCalendarConfigured()) {
    return jsonError(503, 'not_configured', t('notConfiguredYet'))
  }

  const limited = await rateLimit(userKey('gcal:connect', ctx.user.id), 10, 10 * 60_000)
  if (!limited.ok) return jsonError(429, 'rate_limited', t('tooManyAttemptsLater'), { 'Retry-After': String(limited.retryAfter) })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return jsonError(400, 'invalid_payload', t('invalidTarget'))

  const state = randomValue(32)
  const verifier = randomValue(48) // 64 caractères base64url (RFC 7636 : 43 à 128)
  const nonce = randomValue(24)
  const sealed = sealState(JSON.stringify({
    s: state, v: verifier, n: nonce, u: ctx.user.id, t: parsed.data.target, e: Date.now() + STATE_TTL_S * 1000,
  }))

  const res = NextResponse.json(
    { url: buildAuthorizationUrl(cfg, { state, verifier, nonce, scopes: scopesFor(parsed.data.target) }) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  res.cookies.set(STATE_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax : envoyé lors du retour de Google (navigation GET de premier niveau), pas sur les sous-requêtes tierces.
    sameSite: 'lax',
    path: CALLBACK_PATH,
    maxAge: STATE_TTL_S,
  })
  return res
}
