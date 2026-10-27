import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE, DEMO_MODE, isDemoAccountId } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { redirectWithSession, updateSession } from '@/lib/supabase/middleware'
import { ADMIN_ENTRY_PREFIX, ADMIN_GATE_COOKIE, ADMIN_LOGIN_PATH, adminGateConfigured, adminGateProof, hasAdminGate, isValidAdminEntry } from '@/lib/admin/gate'

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/')

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Routes d'API appelées par des tiers (authentifiées autrement) : exemptées du contrôle d'origine.
const isThirdPartyApi = (p: string) => p === '/api/stripe/webhook' || p === '/api/stripe/cron' || p.startsWith('/api/cron/')

/**
 * Anti-CSRF uniforme (défense en profondeur, en plus de SameSite=Lax) : une mutation d'API
 * déclenchée depuis un autre site est refusée. On se fie à Sec-Fetch-Site (envoyé par tous les
 * navigateurs récents, non modifiable par JS), avec repli sur l'en-tête Origin ; en l'absence
 * des deux (vieux navigateur en même origine), on laisse SameSite=Lax jouer son rôle.
 */
function isCrossSite(req: NextRequest): boolean {
  const sfs = req.headers.get('sec-fetch-site')
  if (sfs) return sfs !== 'same-origin' && sfs !== 'none'
  const origin = req.headers.get('origin')
  if (origin) {
    try { return new URL(origin).host !== req.headers.get('host') } catch { return true }
  }
  return false
}

/**
 * Porte d'accès masqué à l'administration (couche d'obscurité EN PLUS de l'auth + rôle admin).
 * - Lien secret `/console/<secret>` : pose le cookie de porte puis redirige vers /console (le
 *   formulaire de connexion DÉDIÉ à l'admin, isolé de la connexion des parents).
 * - /console et /admin sans ce cookie : « page introuvable » (404), l'espace reste invisible.
 * Renvoie une réponse à retourner immédiatement, ou null pour laisser passer.
 * Inactif si ADMIN_GATE_SECRET n'est pas configuré (démo, local).
 */
async function adminGate(req: NextRequest): Promise<NextResponse | null> {
  if (!adminGateConfigured()) return null
  const p = req.nextUrl.pathname
  const notFound = () => NextResponse.rewrite(new URL('/__introuvable', req.url))
  // Lien secret d'entrée : /console/<secret> (a un jeton après /console/).
  if (p.startsWith(ADMIN_ENTRY_PREFIX)) {
    const token = decodeURIComponent(p.slice(ADMIN_ENTRY_PREFIX.length))
    if (await isValidAdminEntry(token)) {
      const res = NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, req.url))
      res.cookies.set(ADMIN_GATE_COOKIE, await adminGateProof(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
      return res
    }
    return notFound()
  }
  // Page de connexion admin (/console exact) et back-office (/admin*) : cookie de porte exigé.
  if ((p === ADMIN_LOGIN_PATH || isAdminPath(p)) && !(await hasAdminGate(req.cookies.get(ADMIN_GATE_COOKIE)?.value))) {
    return notFound()
  }
  return null
}

const isProtected = (pathname: string) =>
  pathname === '/app' || pathname.startsWith('/app/') || pathname === '/admin' || pathname.startsWith('/admin/')

function loginUrl(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/onboarding/connexion'
  url.search = ''
  url.searchParams.set('suite', req.nextUrl.pathname)
  return url
}

// --- Formule choisie avant inscription ------------------------------------
// /abonner (lien des tarifs de la page d'accueil) pose ce cookie pour un visiteur
// non connecté. À la première arrivée sur /app après connexion ou inscription, on
// le renvoie sur « Mon abonnement » avec la formule présélectionnée, puis on l'efface.
const PLAN_INTENT_COOKIE = 'lp_plan_intent'

function planIntentUrl(req: NextRequest): URL | null {
  if (req.nextUrl.pathname !== '/app') return null
  const raw = req.cookies.get(PLAN_INTENT_COOKIE)?.value
  if (!raw) return null
  const m = /^(premium|coparentalite)\.(mensuel|annuel)$/.exec(raw)
  const url = req.nextUrl.clone()
  url.pathname = '/app/abonnement'
  url.search = ''
  if (m) {
    url.searchParams.set('formule', m[1]!)
    url.searchParams.set('cycle', m[2]!)
  }
  return url
}

// --- Authentification réelle (Supabase) --------------------------------
async function supabaseMiddleware(req: NextRequest) {
  // Rafraîchit la session sur toutes les routes couvertes par le matcher.
  const { response, user, supabase } = await updateSession(req)
  const { pathname } = req.nextUrl

  if (!isProtected(pathname)) return response
  if (!user) return redirectWithSession(response, loginUrl(req))

  // 2FA activée mais code TOTP pas encore saisi pour cette session : retour à l'étape code.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2')) {
    const url = loginUrl(req)
    url.searchParams.set('mfa', '1')
    return redirectWithSession(response, url)
  }

  // Formule choisie avant inscription : consommée seulement APRÈS la double authentification
  // (un compte 2FA qui passe par l'étape code garde sa formule et sa périodicité).
  const intent = planIntentUrl(req)
  if (intent) {
    const redirect = redirectWithSession(response, intent)
    redirect.cookies.delete(PLAN_INTENT_COOKIE)
    return redirect
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // Rôle vérifié en base (RPC SECURITY DEFINER), jamais d'après le client.
    const { data: isAdmin, error } = await supabase.rpc('is_admin')
    if (error || isAdmin !== true) {
      const url = req.nextUrl.clone()
      url.pathname = '/app'
      url.search = ''
      return redirectWithSession(response, url)
    }
    // La 2FA n'est PAS imposée pour l'admin : l'accès repose sur le lien secret
    // (porte masquée) + authentification + rôle admin vérifié en base. La 2FA
    // reste disponible et recommandée (Profil → Sécurité) ; si un facteur est
    // enregistré, la vérification aal2 standard ci-dessus s'applique toujours.
  }
  return response
}

// --- Mode démonstration (inchangé) -----------------------------------
// Le cookie de démo n'est pas une preuve d'identité : recette uniquement.
function demoMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!isProtected(pathname)) return NextResponse.next()

  const session = req.cookies.get(DEMO_COOKIE)?.value
  const valid = isDemoAccountId(session)

  if (pathname.startsWith('/admin')) {
    return session === 'admin' ? NextResponse.next() : NextResponse.redirect(loginUrl(req))
  }

  if (!valid) return NextResponse.redirect(loginUrl(req))

  // Formule choisie sur la page d'accueil avant connexion : retour direct sur l'abonnement.
  const intent = planIntentUrl(req)
  if (intent) {
    const redirect = NextResponse.redirect(intent)
    redirect.cookies.delete(PLAN_INTENT_COOKIE)
    return redirect
  }
  return NextResponse.next()
}

// --- Ni Supabase ni démo ------------------------------------------------
// En production, une configuration incomplète (clés Supabase absentes, démo
// désactivée) ne doit jamais laisser passer vers l'espace connecté, l'admin ou
// l'API : on échoue fermé avec un 503. Hors production, comportement inchangé.
const isUnavailableWithoutBackend = (pathname: string) =>
  isProtected(pathname) || pathname === '/api' || pathname.startsWith('/api/')

function notConfigured(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '300' }
  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json(
      { error: { code: 'service_unavailable', message: 'Service momentanément indisponible.' } },
      { status: 503, headers },
    )
  }
  return new NextResponse('Service momentanément indisponible.', {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function middleware(req: NextRequest) {
  // Porte d'accès masqué : s'applique avant tout, y compris avant la redirection de connexion,
  // pour que /admin reste invisible (404) à qui n'a pas le lien secret.
  const gated = await adminGate(req)
  if (gated) return gated

  // Anti-CSRF : refuse toute mutation d'API venue d'un autre site (hors webhook Stripe et crons).
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/api/') && MUTATING.has(req.method) && !isThirdPartyApi(pathname) && isCrossSite(req)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Origine non autorisée.' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (SUPABASE_ENABLED) return supabaseMiddleware(req)
  if (DEMO_MODE) return demoMiddleware(req)
  if (process.env.NODE_ENV === 'production' && isUnavailableWithoutBackend(req.nextUrl.pathname)) {
    return notConfigured(req)
  }
  return NextResponse.next()
}

export const config = {
  // Toutes les routes sauf assets statiques : nécessaire pour que la session
  // Supabase soit rafraîchie aussi sur les pages publiques et les routes API.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)'],
}
