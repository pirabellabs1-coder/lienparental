/**
 * GET /api/integrations/google/calendar/callback?code=…&state=…
 * Retour de l'autorisation Google (URI = GOOGLE_REDIRECT_URI).
 *
 * Contrôles, dans l'ordre (tout échec → refus, aucun échange de code) :
 *   1. session Lien Parental valide (aal2 si facteur MFA) ;
 *   2. cookie d'état présent, déchiffrable, non expiré, à usage unique ;
 *   3. `state` reçu = `state` du cookie (temps constant) et même utilisateur ;
 *   4. échange du code avec le code_verifier PKCE ;
 *   5. portées accordées suffisantes, ID token (iss, aud, exp, nonce).
 * Puis jetons chiffrés en base et renvoi des événements à venir en file.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { jsonError } from '@/lib/data/server/http'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'
import { CALLBACK_PATH, STATE_COOKIE, googleCalendarConfigured, googleOAuthConfig, scopesAllow } from '@/lib/integrations/google/config'
import { openState, sealToken } from '@/lib/integrations/google/crypto'
import { guard } from '@/lib/integrations/google/http'
import { exchangeCode, parseIdToken, revokeToken, safeEqual } from '@/lib/integrations/google/oauth'
import * as store from '@/lib/integrations/google/store'
import { enqueueUpcoming } from '@/lib/integrations/google/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS = '/app/calendrier/parametres'

const stateSchema = z.object({
  s: z.string().min(32).max(128),
  v: z.string().min(43).max(128),
  n: z.string().min(16).max(128),
  u: z.string().uuid(),
  t: z.enum(['dedicated', 'primary']),
  e: z.number(),
})

function back(req: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`${SETTINGS}?google=${code}`, req.nextUrl.origin), 303)
  // Usage unique : le cookie d'état est effacé quelle que soit l'issue.
  res.cookies.set(STATE_COOKIE, '', { path: CALLBACK_PATH, maxAge: 0, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer') // le code d'autorisation ne fuit pas vers la page suivante
  return res
}

export async function GET(req: NextRequest) {
  const ctx = await guard()
  if (ctx.kind === 'denied') {
    // Navigation de navigateur : retour à la connexion ; appel programmatique : 401/403 JSON.
    if ((req.headers.get('accept') ?? '').includes('text/html') && ctx.response.status === 401) {
      return NextResponse.redirect(new URL(`/onboarding/connexion?suite=${encodeURIComponent(SETTINGS)}`, req.nextUrl.origin), 303)
    }
    return ctx.response
  }
  const cfg = googleOAuthConfig()
  if (ctx.kind === 'demo' || !cfg || !googleCalendarConfigured()) return back(req, 'non_configure')

  const limited = await rateLimit(userKey('gcal:callback', ctx.user.id), 10, 10 * 60_000)
  if (!limited.ok) return jsonError(429, 'rate_limited', 'Trop de tentatives.', { 'Retry-After': String(limited.retryAfter) })

  const sp = req.nextUrl.searchParams
  const raw = req.cookies.get(STATE_COOKIE)?.value
  const opened = raw ? openState(raw) : null
  let st: z.infer<typeof stateSchema> | null = null
  try { st = opened ? stateSchema.parse(JSON.parse(opened)) : null } catch { st = null }
  const stateParam = sp.get('state') ?? ''
  if (!st || st.e < Date.now() || !safeEqual(stateParam, st.s) || st.u !== ctx.user.id) {
    return back(req, 'etat_invalide')
  }

  // Refus de l'utilisateur sur l'écran de consentement Google.
  if (sp.get('error')) return back(req, sp.get('error') === 'access_denied' ? 'refuse' : 'erreur')
  const code = sp.get('code')
  if (!code || code.length > 2048) return back(req, 'erreur')

  const ex = await exchangeCode(cfg, code, st.v)
  if (!ex.ok) return back(req, ex.kind === 'transient' ? 'indisponible' : 'erreur')
  const tokens = ex.tokens

  const identity = parseIdToken(cfg, tokens.id_token, st.n)
  if (!identity) {
    await revokeToken(tokens.refresh_token ?? tokens.access_token)
    return back(req, 'erreur')
  }
  // Cases décochées sur l'écran de consentement granulaire : accès insuffisant, on ne garde rien.
  if (!scopesAllow(tokens.scope, st.t)) {
    await revokeToken(tokens.refresh_token ?? tokens.access_token)
    return back(req, 'autorisation_incomplete')
  }

  try {
    const userId = ctx.user.id
    const existing = await store.getConnection(userId)
    const sameAccount = existing?.google_sub === identity.sub
    const refreshSealed = tokens.refresh_token
      ? sealToken(userId, 'refresh', tokens.refresh_token)
      : sameAccount ? existing?.refresh_token_enc ?? null : null
    if (!refreshSealed) return back(req, 'erreur')

    if (existing && !sameAccount) {
      // Autre compte Google : les liens pointent vers des agendas inaccessibles.
      await store.clearQueue(userId)
      await store.deleteAllLinks(userId)
    }

    await store.upsertConnection(userId, {
      status: 'active',
      google_sub: identity.sub,
      google_email: identity.email,
      scopes: tokens.scope,
      refresh_token_enc: refreshSealed,
      access_token_enc: sealToken(userId, 'access', tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      target: st.t,
      calendar_id: sameAccount ? existing?.calendar_id ?? null : null,
      connected_at: new Date().toISOString(),
      last_error_code: null,
    })

    // Envoi initial (traité ensuite par l'écran de paramètres, par lots).
    await enqueueUpcoming(userId, ctx.db).catch(() => 0)
    return back(req, 'connecte')
  } catch {
    return back(req, 'erreur')
  }
}
