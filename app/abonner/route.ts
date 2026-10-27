import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'

/**
 * GET /abonner?formule=premium|coparentalite&cycle=mensuel|annuel
 * Lien des boutons de tarifs (page d'accueil).
 *  - connecté : « Mon abonnement » avec la formule présélectionnée ;
 *  - non connecté : création de compte, en mémorisant la formule (cookie
 *    lp_plan_intent, 1 jour) ; le middleware ramène sur « Mon abonnement »
 *    à la première arrivée dans l'espace connecté.
 * Aucune donnée personnelle dans l'URL ; valeurs strictement validées.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const formule = sp.get('formule') === 'coparentalite' ? 'coparentalite' : 'premium'
  const cycle = sp.get('cycle') === 'annuel' ? 'annuel' : 'mensuel'

  const user = await getCurrentUser()
  const url = req.nextUrl.clone()
  url.search = ''
  if (user) {
    url.pathname = '/app/abonnement'
    url.searchParams.set('formule', formule)
    url.searchParams.set('cycle', cycle)
    return NextResponse.redirect(url, { status: 303 })
  }

  url.pathname = '/onboarding'
  const res = NextResponse.redirect(url, { status: 303 })
  res.cookies.set('lp_plan_intent', `${formule}.${cycle}`, {
    path: '/',
    maxAge: 24 * 60 * 60,
    sameSite: 'lax',
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
  })
  return res
}
