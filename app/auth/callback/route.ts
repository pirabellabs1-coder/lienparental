/**
 * GET /auth/callback?code=…&next=/app[&flow=google]
 * Retour des liens e-mail en flux PKCE (lien de confirmation par défaut de
 * Supabase, changement d'e-mail) et de la connexion « Continuer avec Google » :
 * échange le code contre une session (cookies HttpOnly posés par le client
 * serveur), puis redirige vers un chemin interne uniquement (safeNext).
 *
 * Flux Google (flow=google), en plus :
 *   - double authentification : si un facteur TOTP vérifié existe, la session
 *     n'est qu'en aal1 → étape code de /onboarding/connexion (?mfa=1) ;
 *   - profil : la ligne public.users est créée par le trigger 0200 (nouveau
 *     compte) ou existe déjà (compte e-mail rattaché par Supabase à la même
 *     adresse vérifiée) ; prénom / nom complétés depuis Google s'ils manquent ;
 *   - toute première connexion (et aucun enfant enregistré) → suite de l'onboarding, SAUF si
 *     `next` désigne une autre destination que l'accueil (ex. invitation d'un coparent
 *     /app/coparents/invitation/…) : on la conserve, sinon l'invitation serait perdue.
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient, createServiceClient, type TypedSupabaseClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'
import { hasRequiredAal } from '@/lib/auth/session'
import { recordCurrentSignIn } from '@/lib/notify/login'

export const dynamic = 'force-dynamic'

/** Au-delà de 15 min après la création, on ne propose plus jamais l'accueil (onboarding). */
const NEW_ACCOUNT_MS = 15 * 60_000
/** Écart toléré entre création du compte et connexion pour reconnaître la toute première connexion. */
const FIRST_SIGN_IN_MS = 60_000

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  return s || null
}

/** Prénom / nom fournis par Google (given_name / family_name, à défaut découpage du nom complet). */
function namesFromGoogle(user: User): { prenom: string | null; nom: string | null } {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  const prenom = clean(m.given_name)
  const nom = clean(m.family_name)
  if (prenom || nom) return { prenom, nom }
  const full = clean(m.full_name) ?? clean(m.name)
  if (!full) return { prenom: null, nom: null }
  const [first, ...rest] = full.split(/\s+/)
  return { prenom: clean(first), nom: clean(rest.join(' ')) }
}

async function afterGoogle(supabase: TypedSupabaseClient, next: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return '/onboarding/connexion?erreur=google'

  // 2FA activée : le code TOTP reste exigé, même via Google.
  if (!(await hasRequiredAal(supabase))) {
    return `/onboarding/connexion?mfa=1&suite=${encodeURIComponent(next)}`
  }

  let { data: profile } = await supabase.from('users').select('prenom, nom, deleted_at').eq('id', user.id).maybeSingle()

  // Compte en cours de suppression : pas de connexion.
  if (profile?.deleted_at) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return '/onboarding/connexion?erreur=compte'
  }

  const google = namesFromGoogle(user)

  // Filet de sécurité si le trigger 0200 n'a pas créé la ligne (environnement partiel).
  if (!profile && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createServiceClient() as unknown as SupabaseClient
    await admin.from('users').upsert(
      { id: user.id, email: user.email, prenom: google.prenom, nom: google.nom, email_verified: Boolean(user.email_confirmed_at) },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    await admin.from('preferences').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    profile = { prenom: google.prenom, nom: google.nom, deleted_at: null }
  } else if (profile && ((!profile.prenom && google.prenom) || (!profile.nom && google.nom))) {
    // On ne remplace jamais un nom déjà saisi par l'utilisateur.
    const patch = { prenom: profile.prenom || google.prenom, nom: profile.nom || google.nom }
    const { error: upErr } = await supabase.from('users').update(patch).eq('id', user.id)
    if (!upErr) profile = { ...profile, ...patch }
  }

  // `next` est déjà passé par safeNext (GET) ; destination explicite → conservée.
  const explicitNext = !/^\/app\/?(?:[?#]|$)/.test(next)
  if (explicitNext || !isFirstSignIn(user)) return next
  // Première connexion seulement, et jamais si un enfant est déjà enregistré (RLS : ses propres enfants).
  const { data: kids } = await supabase.from('children').select('id').is('deleted_at', null).limit(1)
  if (kids?.length) return next
  return profile?.prenom && profile?.nom ? '/onboarding/enfant' : '/onboarding/profil'
}

/**
 * Toute première connexion du compte : à la création, last_sign_in_at ≈ created_at ; chaque reconnexion
 * l'avance. Une reconnexion (même quelques minutes après l'inscription) mène donc directement à l'espace.
 */
function isFirstSignIn(user: User): boolean {
  const created = Date.parse(user.created_at)
  if (Date.now() - created > NEW_ACCOUNT_MS) return false
  const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : created
  return Math.abs(last - created) < FIRST_SIGN_IN_MS
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const isGoogle = searchParams.get('flow') === 'google'
  const next = safeNext(searchParams.get('next'), isGoogle ? '/app' : '/onboarding/profil')
  const motif = isGoogle ? 'google' : 'lien'
  const fail = (m: string) => NextResponse.redirect(new URL(`/onboarding/connexion?erreur=${m}`, origin))

  if (!SUPABASE_ENABLED) return NextResponse.redirect(new URL('/onboarding/connexion', origin))

  // Erreur renvoyée par GoTrue (lien expiré, déjà utilisé, consentement Google refusé…).
  if (searchParams.get('error')) return fail(motif)

  const code = searchParams.get('code')
  if (!code) return fail(motif)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return fail(motif)

  if (!isGoogle) {
    // Lien e-mail (inscription, changement d'adresse) : session ouverte sur cet appareil.
    if (await hasRequiredAal(supabase)) await recordCurrentSignIn(supabase, req.headers)
    return NextResponse.redirect(new URL(next, origin))
  }
  const dest = await afterGoogle(supabase, next)
  // Google sans 2FA (sinon l'étape code de /onboarding/connexion s'en charge) : détection d'un nouvel appareil.
  if (!dest.startsWith('/onboarding/connexion') && (await hasRequiredAal(supabase))) await recordCurrentSignIn(supabase, req.headers)
  return NextResponse.redirect(new URL(safeNext(dest, '/app'), origin))
}
