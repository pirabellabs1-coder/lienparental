/**
 * Inscription, renvoi du code et mot de passe oublié avec NOS e-mails (gabarits Lien Parental)
 * au lieu des modèles par défaut de Supabase.
 *
 * Module PUR (ni `server-only`, ni Supabase) : les accès extérieurs passent par `deps`
 * (routes /api/auth/signup et /api/auth/password-reset ; doublures dans tests/auth-email-flows.test.ts).
 *
 * Principe : le serveur appelle supabase.auth.admin.generateLink (service_role), qui crée le
 * compte ou le jeton SANS envoyer d'e-mail et renvoie le code (email_otp, 6 à 10 chiffres selon « Email OTP Length ») et le
 * jeton haché (hashed_token). Nous envoyons ensuite notre e-mail : code + lien vers la page
 * intermédiaire /auth/confirmer (bouton : un scanner de liens ne consomme pas le jeton).
 *
 * Sécurité :
 *  - pré-détournement de compte impossible : le compte est TOUJOURS créé avec un mot de passe
 *    aléatoire jetable ; le mot de passe choisi n'est posé qu'APRÈS la preuve de possession de
 *    l'adresse (code vérifié, puis updateUser côté navigateur, ou étape « Choisissez votre mot
 *    de passe » pour le lien). Le mot de passe saisi ne transite jamais par cette route ;
 *  - réponse NEUTRE et en temps constant : après validation et limites de débit, tout le reste
 *    (recherche du compte, generateLink, envoi) s'exécute APRÈS la réponse (`deliver`, after()) ;
 *  - adresse déjà confirmée : e-mail « vous avez déjà un compte » au titulaire ;
 *  - limites par IP, par adresse et plafond quotidien par adresse (5 / 24 h, anti-bombardement),
 *    empreintes seulement, fail-closed ;
 *  - aucune donnée saisie (prénom…) dans un e-mail envoyé à une adresse non vérifiée.
 *
 * Langue des e-mails : compte confirmé → sa langue (preferences.langue, `deps.userLocale`) ;
 * nouveau compte ou compte en attente → langue d'affichage du visiteur (cookie lp_locale, passée
 * par la route). La langue du compte n'est enregistrée qu'une fois l'adresse prouvée
 * (étape mot de passe de l'inscription, sous la session de l'utilisateur), jamais par ce flux anonyme.
 */
import { z } from 'zod'
import { emailSchema } from './validation'
import { isEmailOtp } from './email-otp'
import { ipKey, tokenKey, type RateLimitResult } from '@/lib/data/server/rate-limit-core'
import { verificationEmail } from '@/lib/email/templates/verification'
import { resetPasswordEmail } from '@/lib/email/templates/resetPassword'
import { accountExistsEmail } from '@/lib/email/templates/accountExists'
import type { Locale } from '@/lib/email/i18n'
import { libT } from '@/lib/i18n/runtime'

export const signupSchema = z.object({ email: emailSchema, resend: z.boolean().optional() }).strict()
export const resetSchema = z.object({ email: emailSchema }).strict()

export type ExistingUser = { id: string; prenom: string; confirmed: boolean; deleted: boolean }

export type GenerateLinkArgs =
  | { type: 'signup'; email: string; password: string; redirectTo: string }
  | { type: 'recovery'; email: string; redirectTo: string }

export type GeneratedLink = { ok: true; otp: string; hashedToken: string } | { ok: false; code: string }

export type FlowDeps = {
  rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
  findUser(email: string): Promise<ExistingUser | null>
  generateLink(args: GenerateLinkArgs): Promise<GeneratedLink>
  sendEmail(args: { to: string; subject: string; html: string; idempotencyKey?: string }): Promise<{ ok: boolean }>
  /** Mot de passe jetable fort (création du compte ; GoTrue l'ignore pour un compte existant). */
  randomPassword(): string
  /** Origine de l'application, ex. https://lienparental.fr */
  appOrigin: string
  /** Langue enregistrée d'un compte existant (null : inconnue). Absent : langue du visiteur. */
  userLocale?(userId: string): Promise<Locale | null>
  log?(msg: string, meta?: Record<string, unknown>): void
  /** Anomalie à corriger (réglage du projet…) ; à défaut : `log`. */
  logError?(msg: string, meta?: Record<string, unknown>): void
}

export type FlowResult =
  | { status: 200; body: { ok: true } }
  | { status: 422; code: string; message: string }
  | { status: 429 | 503; code: string; message: string; retryAfter: number }

export type Prepared = { result: FlowResult; deliver?: () => Promise<void> }

const OK: FlowResult = { status: 200, body: { ok: true } }
const DAY = 24 * 60 * 60_000

export const LIMITS = {
  signupIp: { limit: 10, windowMs: 60 * 60_000 },
  signupEmail: { limit: 3, windowMs: 15 * 60_000 },
  resetIp: { limit: 10, windowMs: 60 * 60_000 },
  resetEmail: { limit: 3, windowMs: 60 * 60_000 },
  /** Plafond quotidien par adresse, inscription + renvoi + mot de passe oublié confondus. */
  emailDaily: { limit: 5, windowMs: DAY },
} as const

/** Messages d'erreur dans la langue du visiteur (français par défaut). */
const flowT = (locale: Locale | null) => libT('auth', locale ?? 'fr')

async function limited(deps: FlowDeps, checks: [string, { limit: number; windowMs: number }][], locale: Locale | null): Promise<FlowResult | null> {
  const t = flowT(locale)
  for (const [key, l] of checks) {
    const r = await deps.rateLimit(key, l.limit, l.windowMs)
    if (!r.ok) {
      return r.reason === 'unavailable'
        ? { status: 503, code: 'unavailable', message: t('errors.serviceUnavailable'), retryAfter: r.retryAfter }
        : { status: 429, code: 'rate_limited', message: t('errors.emailRateLimit'), retryAfter: r.retryAfter }
    }
  }
  return null
}

/** Lien de l'e-mail : page intermédiaire avec bouton (le GET ne consomme pas le jeton). */
export const confirmUrl = (origin: string, hashedToken: string, type: 'signup' | 'recovery', next: string) =>
  `${origin}/auth/confirmer?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent(next)}`

/** Après confirmation par lien : l'utilisateur choisit son mot de passe (le compte a un mot de passe aléatoire). */
export const SIGNUP_PASSWORD_STEP = '/nouveau-mot-de-passe?inscription=1'

const errMsg = (e: unknown) => (e instanceof Error ? e.message.slice(0, 80) : 'unknown')

/** Langue enregistrée d'un compte ; null si inconnue ou en cas d'erreur (jamais bloquant). */
async function accountLocale(deps: FlowDeps, userId: string): Promise<Locale | null> {
  if (!deps.userLocale) return null
  try {
    return await deps.userLocale(userId)
  } catch {
    return null
  }
}

/**
 * POST /api/auth/signup { email } (inscription) ou { email, resend: true } (« Renvoyer le code »).
 * Contrôles synchrones (validation, débit) ; `deliver` à exécuter APRÈS la réponse.
 */
export async function prepareSignup(deps: FlowDeps, body: unknown, ip: string, visitorLocale: Locale | null = null): Promise<Prepared> {
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) return { result: { status: 422, code: 'validation_failed', message: flowT(visitorLocale)('validation.emailInvalid') } }
  const { email } = parsed.data
  const resend = parsed.data.resend === true

  const tooMany = await limited(deps, [
    [ipKey('signup', ip), LIMITS.signupIp],
    [tokenKey('signup-email', email), LIMITS.signupEmail],
    [tokenKey('auth-mail-day', email), LIMITS.emailDaily],
  ], visitorLocale)
  if (tooMany) return { result: tooMany }

  const deliver = async () => {
    try {
      const existing = await deps.findUser(email)
      if (existing?.deleted) return
      if (existing?.confirmed) {
        // Adresse déjà confirmée : on prévient le titulaire (renvoi du code : rien).
        if (!resend) {
          const locale = (await accountLocale(deps, existing.id)) ?? visitorLocale ?? 'fr'
          const mail = accountExistsEmail({ prenom: existing.prenom }, locale)
          await deps.sendEmail({ to: email, subject: mail.subject, html: mail.html })
        }
        return
      }
      if (!existing && resend) return // aucun compte : rien à renvoyer
      // Nouveau compte OU compte en attente : mot de passe aléatoire, aucune métadonnée saisie.
      const link = await deps.generateLink({
        type: 'signup', email, password: deps.randomPassword(), redirectTo: `${deps.appOrigin}${SIGNUP_PASSWORD_STEP}`,
      })
      if (!link.ok) { deps.log?.('generateLink signup en échec', { code: link.code }); return }
      if (!isEmailOtp(link.otp)) {
        // Le code ne pourra pas être saisi (l'écran accepte 6 à 10 chiffres) ; le lien de l'e-mail reste valable.
        // Jamais le code lui-même dans les journaux : seulement sa longueur et sa forme.
        const meta = { length: typeof link.otp === 'string' ? link.otp.length : null, digitsOnly: /^\d*$/.test(String(link.otp ?? '')) }
        ;(deps.logError ?? deps.log)?.('ERREUR generateLink signup : code e-mail hors format (6 à 10 chiffres attendus), vérifier « Email OTP Length » dans Supabase', meta)
      }
      const mail = verificationEmail({
        prenom: '', // adresse non encore vérifiée : jamais de texte saisi par le demandeur
        code: link.otp,
        url: confirmUrl(deps.appOrigin, link.hashedToken, 'signup', SIGNUP_PASSWORD_STEP),
      }, visitorLocale ?? 'fr')
      await deps.sendEmail({ to: email, subject: mail.subject, html: mail.html })
    } catch (e) {
      deps.log?.('inscription : erreur', { error: errMsg(e) })
    }
  }
  return { result: OK, deliver }
}

/** POST /api/auth/password-reset { email } : contrôles synchrones puis `deliver` APRÈS la réponse. */
export async function prepareReset(deps: FlowDeps, body: unknown, ip: string, visitorLocale: Locale | null = null): Promise<Prepared> {
  const parsed = resetSchema.safeParse(body)
  if (!parsed.success) return { result: { status: 422, code: 'validation_failed', message: flowT(visitorLocale)('validation.emailInvalid') } }
  const email = parsed.data.email
  const tooMany = await limited(deps, [
    [ipKey('reset', ip), LIMITS.resetIp],
    [tokenKey('reset-email', email), LIMITS.resetEmail],
    [tokenKey('auth-mail-day', email), LIMITS.emailDaily],
  ], visitorLocale)
  if (tooMany) return { result: tooMany }

  const deliver = async () => {
    try {
      const user = await deps.findUser(email)
      if (!user || user.deleted) return
      const link = await deps.generateLink({ type: 'recovery', email, redirectTo: `${deps.appOrigin}/nouveau-mot-de-passe` })
      if (!link.ok) { deps.log?.('generateLink recovery en échec', { code: link.code }); return }
      // Compte confirmé : prénom connu et vérifié, langue du compte ; en attente : aucun texte saisi, langue du visiteur.
      const locale = (user.confirmed ? await accountLocale(deps, user.id) : null) ?? visitorLocale ?? 'fr'
      const mail = resetPasswordEmail({
        prenom: user.confirmed ? user.prenom : '',
        url: confirmUrl(deps.appOrigin, link.hashedToken, 'recovery', '/nouveau-mot-de-passe'),
      }, locale)
      await deps.sendEmail({ to: email, subject: mail.subject, html: mail.html })
    } catch (e) {
      deps.log?.('réinitialisation : erreur', { error: errMsg(e) })
    }
  }
  return { result: OK, deliver }
}
