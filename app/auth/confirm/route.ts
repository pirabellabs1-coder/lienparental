/**
 * GET /auth/confirm?token_hash=…&type=recovery&next=/nouveau-mot-de-passe
 * Vérifie un lien e-mail Supabase (modèles utilisant {{ .TokenHash }}) via
 * verifyOtp côté serveur — fonctionne même si l'e-mail est ouvert sur un autre
 * appareil (contrairement au flux PKCE). Accepte aussi ?code= (PKCE) en repli.
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'

export const dynamic = 'force-dynamic'

const TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const rawType = searchParams.get('type')
  const type = TYPES.find(t => t === rawType) ?? null
  const fallback = type === 'recovery' ? '/nouveau-mot-de-passe' : '/app'
  const next = safeNext(searchParams.get('next'), fallback)

  if (!SUPABASE_ENABLED) return NextResponse.redirect(new URL('/onboarding/connexion', origin))

  const failTo = type === 'recovery' ? '/mot-de-passe-oublie?erreur=lien' : '/onboarding/connexion?erreur=lien'
  const supabase = await createClient()

  const tokenHash = searchParams.get('token_hash')
  const code = searchParams.get('code')

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return NextResponse.redirect(new URL(failTo, origin))
    return NextResponse.redirect(new URL(next, origin))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL(failTo, origin))
    return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(new URL(failTo, origin))
}
