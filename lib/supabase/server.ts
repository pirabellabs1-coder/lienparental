import 'server-only'
/**
 * Supabase server client (Next.js App Router).
 * À utiliser dans les Server Components, Route Handlers et Server Actions.
 * Cookies de session gérés par @supabase/ssr : SameSite=Lax et, en production, Secure (HTTPS
 * uniquement, forcé ci-dessous et par HSTS). Ils ne sont pas HttpOnly, car le client Supabase
 * du navigateur doit lire la session ; la défense contre leur vol repose sur l'absence de XSS
 * (CSP, rendu échappé) et sur SameSite. Aucune donnée métier sensible n'y transite (jetons d'auth).
 *
 * Typage : @supabase/ssr 0.5.x et supabase-js 2.1xx n'ont plus le même ordre
 * de génériques sur SupabaseClient ; on re-type explicitement le retour en
 * SupabaseClient<Database> pour garder des requêtes typées.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './types'

export type TypedSupabaseClient = SupabaseClient<Database>

export async function createClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies()

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            // En production : Secure forcé (HTTPS uniquement), SameSite=Lax par défaut.
            const secure = process.env.NODE_ENV === 'production'
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, secure: options.secure ?? secure, sameSite: options.sameSite ?? 'lax' }))
          } catch {
            // Appel depuis un Server Component (sans écriture possible) :
            // on ignore. Le middleware se charge du rafraîchissement.
          }
        },
      },
    }
  )
  return client as unknown as TypedSupabaseClient
}

/**
 * Client Supabase avec la service_role key.
 * Bypass RLS : à n'utiliser QUE dans des Route Handlers côté serveur
 * pour: webhooks Stripe, cron rappels, purge corbeille, écritures audit_log,
 * suppression de compte (auth.admin.deleteUser).
 * NE JAMAIS exposer la service_role au navigateur.
 *
 * Fail-closed : si SUPABASE_SERVICE_ROLE_KEY est absent, on lève une
 * exception plutôt que de retomber silencieusement sur un client anon
 * (ce qui ferait échouer les écritures côté RLS avec un message obscur).
 */
export function createServiceClient(): TypedSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY manquant — createServiceClient() refuse')
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  }
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
  }

  return createAdminClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
