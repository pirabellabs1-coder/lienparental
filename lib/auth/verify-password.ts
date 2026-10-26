import 'server-only'
/**
 * Ré-authentification par mot de passe, sans toucher à la session courante.
 *
 * On utilise un client Supabase éphémère (aucune persistance, aucun cookie) :
 * la session de l'utilisateur (éventuellement aal2) reste intacte. La session
 * jetable créée par la vérification est aussitôt révoquée.
 */
import { createClient } from '@supabase/supabase-js'

export type PasswordCheck = 'ok' | 'invalid' | 'rate_limited' | 'error'

export async function verifyPassword(email: string, password: string): Promise<PasswordCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon || !email) return 'error'

  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.status === 429) return 'rate_limited'
    if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid'
    return 'error'
  }
  if (data.session) {
    // Révoque uniquement la session jetable (scope local).
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  return 'ok'
}
