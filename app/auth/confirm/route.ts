/**
 * /auth/confirm : vérification des liens e-mail (inscription, réinitialisation, changement d'adresse…).
 *
 * GET ?token_hash=…&type=…&next=…  → NE CONSOMME PAS le jeton : redirection vers la page intermédiaire
 *   /auth/confirmer (bouton « Continuer »). Les scanners de liens des messageries (Outlook Safe Links,
 *   antivirus…) ouvrent les liens en GET : ils ne doivent pas brûler le jeton à usage unique.
 *   Couvre nos e-mails et les modèles Supabase de repli (scripts/gen-supabase-emails.ts).
 * GET ?code=… (PKCE) : échange immédiat (le code n'est utilisable que par le navigateur d'origine).
 * POST (formulaire de /auth/confirmer, même origine exigée) : verifyOtp côté serveur, fonctionne même
 *   si l'e-mail est ouvert sur un autre appareil. Inscription : étape « Choisissez votre mot de passe »
 *   (le compte a été créé avec un mot de passe aléatoire, lib/auth/email-flows.ts).
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/redirect'
import { hasRequiredAal } from '@/lib/auth/session'
import { recordCurrentSignIn } from '@/lib/notify/login'
import { isSameOrigin } from '@/lib/data/server/http'
import { SIGNUP_PASSWORD_STEP } from '@/lib/auth/email-flows'

export const dynamic = 'force-dynamic'

const TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
const TOKEN_RE = /^[A-Za-z0-9_-]{8,200}$/

function parseType(raw: unknown): EmailOtpType | null {
  return TYPES.find(t => t === raw) ?? null
}

function failPath(type: EmailOtpType | null): string {
  return type === 'recovery' ? '/mot-de-passe-oublie?erreur=lien' : '/onboarding/connexion?erreur=lien'
}

function nextFor(type: EmailOtpType, raw: string | null): string {
  if (type === 'signup') return SIGNUP_PASSWORD_STEP
  return safeNext(raw, type === 'recovery' ? '/nouveau-mot-de-passe' : '/app')
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  if (!SUPABASE_ENABLED) return NextResponse.redirect(new URL('/onboarding/connexion', origin))

  const type = parseType(searchParams.get('type'))
  const tokenHash = searchParams.get('token_hash')
  if (tokenHash && type) {
    const target = new URL('/auth/confirmer', origin)
    target.searchParams.set('token_hash', tokenHash)
    target.searchParams.set('type', type)
    const next = searchParams.get('next')
    if (next) target.searchParams.set('next', next)
    return NextResponse.redirect(target)
  }

  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL(failPath(type), origin))
    if (await hasRequiredAal(supabase)) await recordCurrentSignIn(supabase, req.headers)
    return NextResponse.redirect(new URL(safeNext(searchParams.get('next'), '/app'), origin))
  }

  return NextResponse.redirect(new URL(failPath(type), origin))
}

export async function POST(req: NextRequest) {
  const { origin } = req.nextUrl
  // Connexion forcée par un site tiers (login CSRF) : refusée.
  if (!isSameOrigin(req)) return NextResponse.redirect(new URL('/onboarding/connexion?erreur=lien', origin), 303)
  if (!SUPABASE_ENABLED) return NextResponse.redirect(new URL('/onboarding/connexion', origin), 303)

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.redirect(new URL(failPath(null), origin), 303) }
  const type = parseType(form.get('type'))
  const tokenHash = form.get('token_hash')
  if (!type || typeof tokenHash !== 'string' || !TOKEN_RE.test(tokenHash)) {
    return NextResponse.redirect(new URL(failPath(type), origin), 303)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) return NextResponse.redirect(new URL(failPath(type), origin), 303)
  if (await hasRequiredAal(supabase)) await recordCurrentSignIn(supabase, req.headers)
  const next = form.get('next')
  return NextResponse.redirect(new URL(nextFor(type, typeof next === 'string' ? next : null), origin), 303)
}
