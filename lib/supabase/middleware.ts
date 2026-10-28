/**
 * Rafraîchissement de session Supabase dans le middleware Next.js (pattern @supabase/ssr).
 *
 * - Lit les cookies de la requête, laisse GoTrue renouveler le jeton si besoin,
 *   et recopie les cookies mis à jour sur la requête ET la réponse.
 * - supabase.auth.getUser() revalide le JWT côté serveur Auth : c'est la seule
 *   source fiable pour un contrôle d'accès (getSession() ne vérifie pas la signature).
 *
 * Exécuté sur l'Edge runtime : pas d'import 'server-only' / next/headers ici.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './types'
import { LOCALE_AUTO_COOKIE, LOCALE_COOKIE, type Locale } from '@/lib/i18n/config'
import { forwardHeaders, localeCookieOptions } from '@/lib/i18n/routing'

export type SessionContext = {
  response: NextResponse
  user: User | null
  supabase: SupabaseClient<Database>
}

/**
 * Suite donnée à la requête par la middleware : langue imposée par l'URL (en-tête interne
 * `x-lp-locale`, cf. lib/i18n/routing.ts) et réécriture éventuelle (`/en/aide` → `/aide`).
 */
export type Forward = { locale: Locale | null; rewrite?: URL; setLocaleCookie?: Locale }

/**
 * Réponse « laisser passer » : NextResponse.next() ou rewrite(), avec les en-têtes de requête
 * assainis (en-têtes internes du client supprimés, locale de la middleware posée). Les en-têtes
 * sont relus sur `request` à chaque appel : ils incluent les cookies de session renouvelés.
 */
export function passThrough(request: NextRequest, forward?: Forward): NextResponse {
  const init = { request: { headers: forwardHeaders(request.headers, forward?.locale ?? null) } }
  const res = forward?.rewrite ? NextResponse.rewrite(forward.rewrite, init) : NextResponse.next(init)
  // Langue d'arrivée mémorisée (aucun cookie lp_locale existant, cf. decideLocaleRoute), avec le
  // marqueur « posé automatiquement » : il empêche la 307 des URL françaises (seul un choix explicite redirige).
  if (forward?.setLocaleCookie) {
    const opts = localeCookieOptions(process.env.NODE_ENV === 'production')
    res.cookies.set(LOCALE_COOKIE, forward.setLocaleCookie, opts)
    res.cookies.set(LOCALE_AUTO_COOKIE, '1', opts)
  }
  return res
}

export async function updateSession(request: NextRequest, forward?: Forward): Promise<SessionContext> {
  let response = passThrough(request, forward)

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Même réécriture et mêmes en-têtes qu'au départ : sans cela, sur /en/* les cookies de
          // session renouvelés partiraient avec une réponse qui ne réécrit plus vers la page.
          response = passThrough(request, forward)
          // En production : Secure forcé (HTTPS), SameSite=Lax par défaut.
          const secure = process.env.NODE_ENV === 'production'
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, secure: options.secure ?? secure, sameSite: options.sameSite ?? 'lax' }))
        },
      },
    }
  ) as unknown as SupabaseClient<Database>

  // Ne rien intercaler entre la création du client et getUser() : sinon les
  // utilisateurs peuvent être déconnectés aléatoirement (recommandation Supabase).
  const { data: { user } } = await supabase.auth.getUser()

  return { response, user, supabase }
}

/**
 * Construit une redirection en conservant les cookies de session éventuellement
 * renouvelés pendant updateSession (sinon le nouveau jeton serait perdu).
 */
export function redirectWithSession(from: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach(c => redirect.cookies.set(c))
  return redirect
}
