/**
 * Traduction des erreurs Supabase Auth en messages clairs, dans la langue de l'utilisateur
 * (catalogue `auth.errors`, messages/{fr,en,pt}/auth.json).
 * Utilisable côté client ET serveur (seule dépendance : le traducteur synchrone libT).
 *
 * Règle : on ne renvoie jamais le message brut de GoTrue à l'utilisateur
 * (anglais, parfois technique) et on ne journalise jamais l'e-mail.
 */

import { libT } from '@/lib/i18n/runtime'

export type AuthContext =
  | 'signin'
  | 'signup'
  | 'otp'
  | 'resend'
  | 'reset'
  | 'update-password'
  | 'mfa'
  | 'generic'

type ErrorLike = { code?: string; status?: number; message?: string; name?: string }

/**
 * Traducteur d'un namespace `auth.*` : `libT('auth.errors')` (navigateur / repli français côté
 * serveur) ou `await getTranslations('auth.errors')` (code serveur pendant une requête).
 */
export type AuthTranslate = (key: string, values?: Record<string, string | number>) => string

/** Traducteur synchrone d'un namespace `auth.*` (langue de <html lang>, français côté serveur). */
export function authT(namespace: string): AuthTranslate {
  const t = libT(namespace)
  return (key, values) => (t as unknown as AuthTranslate)(key, values)
}

/**
 * Version française figée (routes API, qui gardent leurs messages en français).
 * Dans du code affiché à l'utilisateur, préférer `rateLimitMessage()`.
 */
export const RATE_LIMIT_MESSAGE =
  'Trop de tentatives en peu de temps. Patientez quelques minutes avant de réessayer.'

export function rateLimitMessage(t: AuthTranslate = authT('auth.errors')): string {
  return t('rateLimit')
}

/** Code GoTrue → clé du catalogue `auth.errors`. */
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'userExists',
  email_exists: 'userExists',
  otp_expired: 'otpExpired',
  otp_disabled: 'otpDisabled',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
  over_request_rate_limit: 'rateLimit',
  over_email_send_rate_limit: 'emailSendRateLimit',
  over_sms_send_rate_limit: 'rateLimit',
  mfa_verification_failed: 'mfaFailed',
  mfa_challenge_expired: 'mfaExpired',
  mfa_factor_name_conflict: 'mfaConflict',
  insufficient_aal: 'insufficientAal',
  reauthentication_needed: 'reauthNeeded',
  session_not_found: 'sessionExpired',
  session_expired: 'sessionExpired',
  refresh_token_not_found: 'sessionExpired',
  user_not_found: 'sessionExpired',
  user_banned: 'userBanned',
  signup_disabled: 'signupDisabled',
  email_address_invalid: 'emailInvalid',
  email_address_not_authorized: 'emailNotAuthorized',
  validation_failed: 'validationFailed',
  bad_jwt: 'sessionExpired',
}

/** Contexte → clé de repli dans `auth.errors.fallback`. */
const FALLBACK: Record<AuthContext, string> = {
  signin: 'fallback.signin',
  signup: 'fallback.signup',
  otp: 'fallback.otp',
  resend: 'fallback.resend',
  reset: 'fallback.reset',
  'update-password': 'fallback.updatePassword',
  mfa: 'fallback.mfa',
  generic: 'fallback.generic',
}

/**
 * Message affichable pour une erreur Supabase Auth.
 * `t` : traducteur du namespace `auth.errors` (par défaut libT, langue du navigateur ;
 * côté serveur pendant une requête, passer `await getTranslations('auth.errors')`).
 */
export function authErrorMessage(
  error: unknown,
  context: AuthContext = 'generic',
  t: AuthTranslate = authT('auth.errors'),
): string {
  return t(authErrorKey(error, context))
}

function authErrorKey(error: unknown, context: AuthContext): string {
  if (!error || typeof error !== 'object') return FALLBACK[context]
  const e = error as ErrorLike

  if (e.status === 429) {
    return e.code === 'over_email_send_rate_limit' ? BY_CODE.over_email_send_rate_limit : 'rateLimit'
  }
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code]

  // Anciennes versions de GoTrue : pas de `code`, uniquement un message.
  const msg = (e.message ?? '').toLowerCase()
  if (msg.includes('invalid login credentials')) return BY_CODE.invalid_credentials
  if (msg.includes('already registered')) return BY_CODE.user_already_exists
  if (msg.includes('expired') || (context === 'otp' && msg.includes('invalid'))) return BY_CODE.otp_expired
  if (msg.includes('rate limit')) return 'rateLimit'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'network'
  return FALLBACK[context]
}

export function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as ErrorLike
  return e.status === 429 || (e.code ?? '').startsWith('over_')
}
