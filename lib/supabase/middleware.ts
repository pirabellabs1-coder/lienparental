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

export type SessionContext = {
  response: NextResponse
  user: User | null
  supabase: SupabaseClient<Database>
}

export async function updateSession(request: NextRequest): Promise<SessionContext> {
  let response = NextResponse.next({ request })

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
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
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
