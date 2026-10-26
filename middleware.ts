import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE, DEMO_MODE, isDemoAccountId } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { redirectWithSession, updateSession } from '@/lib/supabase/middleware'

const isProtected = (pathname: string) =>
  pathname === '/app' || pathname.startsWith('/app/') || pathname === '/admin' || pathname.startsWith('/admin/')

function loginUrl(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/onboarding/connexion'
  url.search = ''
  url.searchParams.set('suite', req.nextUrl.pathname)
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

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // Rôle vérifié en base (RPC SECURITY DEFINER), jamais d'après le client.
    const { data: isAdmin, error } = await supabase.rpc('is_admin')
    if (error || isAdmin !== true) {
      const url = req.nextUrl.clone()
      url.pathname = '/app'
      url.search = ''
      return redirectWithSession(response, url)
    }
    // M7 (audit v3) : l'administration exige une session aal2, même sans facteur
    // enregistré (sinon : enrôlement de la double authentification).
    if (aal.currentLevel !== 'aal2') {
      const url = req.nextUrl.clone()
      url.pathname = '/app/profil/securite/2fa'
      url.search = ''
      url.searchParams.set('raison', 'admin')
      return redirectWithSession(response, url)
    }
  }
  return response
}

// --- Mode démonstration (inchangé) -----------------------------------
// Le cookie de démo n'est pas une preuve d'identité : recette uniquement.
function demoMiddleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  if (!isProtected(pathname)) return NextResponse.next()

  const session = req.cookies.get(DEMO_COOKIE)?.value
  const valid = isDemoAccountId(session)

  if (pathname.startsWith('/admin')) {
    return session === 'admin' ? NextResponse.next() : NextResponse.redirect(loginUrl(req))
  }

  if (!valid) return NextResponse.redirect(loginUrl(req))

  // Le compte Premium voit directement les écrans Premium du profil.
  if (session === 'parent-premium' && (pathname === '/app/profil' || pathname === '/app/profil/abonnement') && !searchParams.has('plan')) {
    const url = req.nextUrl.clone()
    url.searchParams.set('plan', 'premium')
    return NextResponse.redirect(url)
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
