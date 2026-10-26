import 'server-only'
/**
 * Garde des Route Handlers / Server Actions (Supabase uniquement).
 * Renvoie le client RLS de l'utilisateur et son identité revalidée,
 * ou un motif de refus. Ne fait jamais confiance à un identifiant fourni
 * par le client : l'id vient exclusivement de auth.getUser().
 */
import type { User } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient, type TypedSupabaseClient } from '@/lib/supabase/server'
import { hasRequiredAal } from './session'

export type AuthedContext = { ok: true; supabase: TypedSupabaseClient; user: User }
export type AuthDenied = { ok: false; reason: 'disabled' | 'unauthenticated' | 'mfa_required' }

export async function requireAuthedUser(): Promise<AuthedContext | AuthDenied> {
  if (!SUPABASE_ENABLED) return { ok: false, reason: 'disabled' }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, reason: 'unauthenticated' }
  if (!(await hasRequiredAal(supabase))) return { ok: false, reason: 'mfa_required' }
  return { ok: true, supabase, user }
}

export const DENIED_MESSAGES: Record<AuthDenied['reason'], string> = {
  disabled: 'Cette fonctionnalité nécessite un compte réel (mode démonstration).',
  unauthenticated: 'Votre session a expiré. Reconnectez-vous.',
  mfa_required: 'Confirmez votre identité avec votre code de double authentification.',
}
