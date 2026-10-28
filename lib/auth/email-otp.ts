/**
 * Code de vérification d'INSCRIPTION reçu par e-mail (`link.otp` de admin.generateLink).
 *
 * Sa longueur suit le réglage Supabase « Email OTP Length » (6 recommandé, 6 à 10 possibles) :
 * l'application accepte donc 6 à 10 chiffres partout (écran /onboarding/verification,
 * `emailOtpSchema`, contrôle serveur de lib/auth/email-flows.ts). La 2FA TOTP reste à 6 (`otpSchema`).
 *
 * Module PUR (ni React ni zod) : testé par tests/email-otp.test.ts.
 */
export const EMAIL_OTP_MIN = 6
export const EMAIL_OTP_MAX = 10

export const EMAIL_OTP_RE = new RegExp(`^\\d{${EMAIL_OTP_MIN},${EMAIL_OTP_MAX}}$`)

/** Ne garde que les chiffres (espaces, tirets, points… ignorés), au plus EMAIL_OTP_MAX. */
export function normalizeEmailOtp(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, EMAIL_OTP_MAX)
}

/** Code complet : 6 à 10 chiffres, rien d'autre. */
export function isEmailOtp(value: string): boolean {
  return EMAIL_OTP_RE.test(value)
}

/**
 * Longueur attendue du code, si elle est connue (NEXT_PUBLIC_EMAIL_OTP_LENGTH = réglage
 * « Email OTP Length » du projet). Toute valeur hors 6–10 ou absente : null (longueur inconnue).
 */
export function parseEmailOtpLength(raw: string | undefined | null): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw.trim())) return null
  const n = Number(raw.trim())
  return n >= EMAIL_OTP_MIN && n <= EMAIL_OTP_MAX ? n : null
}

/**
 * Validation automatique : seulement quand un code complet arrive D'UN COUP (collage, saisie
 * automatique « one-time-code ») ET que la longueur attendue est connue. Sinon : clic sur « Vérifier »
 * (un code de 7 chiffres ne doit pas être envoyé tronqué à 6, ni pendant la frappe).
 */
export function shouldAutoVerify(value: string, expectedLength: number | null, bulk: boolean): boolean {
  return bulk && expectedLength !== null && value.length === expectedLength && isEmailOtp(value)
}

/** Saisie « en bloc » : plusieurs chiffres ajoutés en un seul événement (autofill, IME). */
export function isBulkInsert(previous: string, next: string): boolean {
  return next.length - previous.length > 1
}

/** Démonstration (sans Supabase) : codes acceptés 123456, 1234567, … 1234567890 (6 à 10 chiffres). */
export function isDemoEmailOtp(value: string): boolean {
  return isEmailOtp(value) && '1234567890'.startsWith(value)
}
