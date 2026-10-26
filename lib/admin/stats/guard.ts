import 'server-only'
// Garde administrateur des routes /api/admin/stats/**.
// Mode démo : cookie du compte admin de démonstration. Mode réel : session
// Supabase revalidée (requireAuthedUser, MFA comprise) + RPC is_admin() + session
// aal2 obligatoire (M7, audit v3 ; la base exige aussi is_admin_aal2()).
// Fail-closed : toute erreur vaut refus.
import { cookies } from 'next/headers'
import { DEMO_COOKIE, DEMO_MODE } from '@/lib/demo-auth'
import { requireAuthedUser } from '@/lib/auth/guard'
import { isAal2 } from '@/lib/auth/session'
import type { TypedSupabaseClient } from '@/lib/supabase/server'

export type AdminContext =
  | { ok: true; mode: 'demo' }
  | { ok: true; mode: 'live'; supabase: TypedSupabaseClient }
  | { ok: false; status: 401 | 403 | 503; message: string }

export async function requireAdmin(): Promise<AdminContext> {
  if (DEMO_MODE) {
    const isDemoAdmin = (await cookies()).get(DEMO_COOKIE)?.value === 'admin'
    return isDemoAdmin ? { ok: true, mode: 'demo' } : { ok: false, status: 401, message: 'Session administrateur requise.' }
  }
  const auth = await requireAuthedUser()
  if (!auth.ok) {
    if (auth.reason === 'disabled') return { ok: false, status: 503, message: 'Back-office indisponible : Supabase n’est pas configuré.' }
    return { ok: false, status: 401, message: auth.reason === 'mfa_required' ? 'Double authentification requise.' : 'Session expirée.' }
  }
  const { data, error } = await auth.supabase.rpc('is_admin')
  if (error || data !== true) return { ok: false, status: 403, message: 'Accès réservé aux administrateurs.' }
  if (!(await isAal2(auth.supabase))) return { ok: false, status: 403, message: 'Activez la double authentification pour accéder à l’administration.' }
  return { ok: true, mode: 'live', supabase: auth.supabase }
}
