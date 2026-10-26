/**
 * Traduction des erreurs Supabase Auth en messages français clairs.
 * Utilisable côté client ET serveur (aucune dépendance runtime).
 *
 * Règle : on ne renvoie jamais le message brut de GoTrue à l'utilisateur
 * (anglais, parfois technique) et on ne journalise jamais l'e-mail.
 */

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

export const RATE_LIMIT_MESSAGE =
  'Trop de tentatives en peu de temps. Patientez quelques minutes avant de réessayer.'

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Votre adresse e-mail n’est pas encore vérifiée. Saisissez le code reçu par e-mail.',
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.',
  otp_expired: 'Ce code a expiré ou n’est pas valide. Demandez un nouveau code.',
  otp_disabled: 'La vérification par code est indisponible pour le moment.',
  weak_password: 'Ce mot de passe est trop faible ou trop courant. Choisissez-en un autre.',
  same_password: 'Le nouveau mot de passe doit être différent de l’actuel.',
  over_request_rate_limit: RATE_LIMIT_MESSAGE,
  over_email_send_rate_limit: 'Trop d’e-mails envoyés à cette adresse. Patientez quelques minutes avant de redemander un code.',
  over_sms_send_rate_limit: RATE_LIMIT_MESSAGE,
  mfa_verification_failed: 'Code de vérification incorrect. Vérifiez votre application d’authentification.',
  mfa_challenge_expired: 'Le code a expiré. Saisissez le nouveau code affiché par votre application.',
  mfa_factor_name_conflict: 'Une configuration de double authentification est déjà en cours. Réessayez.',
  insufficient_aal: 'Confirmez votre identité avec votre code de double authentification pour continuer.',
  reauthentication_needed: 'Pour des raisons de sécurité, reconnectez-vous puis recommencez.',
  session_not_found: 'Votre session a expiré. Reconnectez-vous.',
  session_expired: 'Votre session a expiré. Reconnectez-vous.',
  refresh_token_not_found: 'Votre session a expiré. Reconnectez-vous.',
  user_not_found: 'Votre session a expiré. Reconnectez-vous.',
  user_banned: 'Ce compte est désactivé. Contactez le support si vous pensez qu’il s’agit d’une erreur.',
  signup_disabled: 'Les inscriptions sont momentanément fermées.',
  email_address_invalid: 'Cette adresse e-mail n’est pas acceptée. Vérifiez-la ou utilisez-en une autre.',
  email_address_not_authorized: 'L’envoi d’e-mails vers cette adresse n’est pas autorisé pour le moment.',
  validation_failed: 'Certaines informations sont invalides. Vérifiez le formulaire.',
  bad_jwt: 'Votre session a expiré. Reconnectez-vous.',
}

const FALLBACK: Record<AuthContext, string> = {
  signin: 'Connexion impossible pour le moment. Réessayez dans un instant.',
  signup: 'La création du compte a échoué. Réessayez dans un instant.',
  otp: 'Code invalide ou expiré.',
  resend: 'Impossible d’envoyer un nouveau code pour le moment.',
  reset: 'Impossible d’envoyer le lien pour le moment.',
  'update-password': 'Impossible de modifier le mot de passe pour le moment.',
  mfa: 'Code de vérification incorrect.',
  generic: 'Une erreur est survenue. Réessayez dans un instant.',
}

export function authErrorMessage(error: unknown, context: AuthContext = 'generic'): string {
  if (!error || typeof error !== 'object') return FALLBACK[context]
  const e = error as ErrorLike

  if (e.status === 429) {
    return e.code === 'over_email_send_rate_limit' ? BY_CODE.over_email_send_rate_limit : RATE_LIMIT_MESSAGE
  }
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code]

  // Anciennes versions de GoTrue : pas de `code`, uniquement un message.
  const msg = (e.message ?? '').toLowerCase()
  if (msg.includes('invalid login credentials')) return BY_CODE.invalid_credentials
  if (msg.includes('already registered')) return BY_CODE.user_already_exists
  if (msg.includes('expired') || (context === 'otp' && msg.includes('invalid'))) return BY_CODE.otp_expired
  if (msg.includes('rate limit')) return RATE_LIMIT_MESSAGE
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Connexion au serveur impossible. Vérifiez votre connexion internet.'
  }
  return FALLBACK[context]
}

export function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as ErrorLike
  return e.status === 429 || (e.code ?? '').startsWith('over_')
}
