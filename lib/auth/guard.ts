import 'server-only'
/**
 * Garde des Route Handlers / Server Actions (Supabase uniquement).
 * Renvoie le client RLS de l'utilisateur et son identité revalidée,
 * ou un motif de refus. Ne fait jamais confiance à un identifiant fourni
 * par le client : l'id vient exclusivement de auth.getUser().
 */
import type { User } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
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

/**
 * Messages de refus en français (figés) : conservés pour les routes API, dont les messages
 * d'erreur restent en français. Pour un message affiché à l'utilisateur dans sa langue,
 * utiliser `await deniedMessage(reason)`.
 */
export const DENIED_MESSAGES: Record<AuthDenied['reason'], string> = {
  disabled: 'Cette fonctionnalité nécessite un compte réel (mode démonstration).',
  unauthenticated: 'Votre session a expiré. Reconnectez-vous.',
  mfa_required: 'Confirmez votre identité avec votre code de double authentification.',
}

/** Message de refus dans la langue de l'utilisateur (cookie de la requête en cours). */
export async function deniedMessage(reason: AuthDenied['reason']): Promise<string> {
  const t = await getTranslations('auth.guard')
  return t(reason)
}
