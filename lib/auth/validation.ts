/**
 * Schémas zod partagés client / serveur.
 * Côté serveur ils sont la barrière de confiance ; côté client ils ne
 * servent qu'à afficher les erreurs plus tôt.
 *
 * i18n : les messages zod sont des CODES stables (`auth.validation.<clé>[?param=valeur]`),
 * jamais du texte. Pour afficher une erreur, passer par `firstIssue()` / `issueMessage()`,
 * qui traduisent (libT par défaut ; dans une Server Action, fournir
 * `await getTranslations('auth.validation')`). Un message qui n'est pas un code est renvoyé tel quel.
 */
import { z } from 'zod'
import { authT, type AuthTranslate } from './errors'

const CODE_PREFIX = 'auth.validation.'

/** Code de message zod : `auth.validation.maxChars?max=80`. */
function code(key: string, params?: Record<string, string | number>): string {
  if (!params) return CODE_PREFIX + key
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  return `${CODE_PREFIX}${key}?${qs}`
}

const trimmed = (max: number) => z.string().trim().max(max, code('maxChars', { max }))

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, code('emailInvalid'))
  .max(254, code('emailTooLong'))
  .email(code('emailInvalid'))

/**
 * Mêmes règles que components/onboarding/PasswordField (PASSWORD_RULES) ET que la politique
 * GoTrue du projet (docs/MISE_EN_SERVICE.md §1.4 : 8 caractères, minuscule, majuscule, chiffre).
 */
export const passwordSchema = z
  .string()
  .min(8, code('passwordMin'))
  .max(72, code('maxChars', { max: 72 })) // limite bcrypt de GoTrue
  .refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v), code('passwordCase'))
  .refine(v => /[0-9]/.test(v), code('passwordDigit'))

export const otpSchema = z.string().regex(/^\d{6}$/, code('otpFormat'))

export const nameSchema = trimmed(80).min(1, code('required'))

export const profileNamesSchema = z.object({
  prenom: nameSchema,
  nom: nameSchema,
})

/** Chemin d'avatar : toujours dans le dossier de l'utilisateur (vérifié côté serveur). */
export const avatarPathSchema = z
  .string()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp)$/, code('photoPathInvalid'))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, code('dateInvalid'))

export const childSchema = z.object({
  id: z.string().uuid().optional(),
  prenom: nameSchema,
  dateNaissance: isoDate.refine(v => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d <= new Date() && d.getUTCFullYear() >= 1990
  }, code('birthDateInvalid')),
  classe: trimmed(60).optional().nullable(),
  photoPath: avatarPathSchema.optional().nullable(),
})

const optionalText = (max: number) =>
  z.string().trim().max(max, code('maxChars', { max })).transform(v => (v === '' ? null : v)).nullable().optional()

export const accountInfoSchema = z.object({
  prenom: nameSchema,
  nom: nameSchema,
  dateNaissance: z.union([isoDate, z.literal('')]).optional().transform(v => (v ? v : null)),
  genre: z.enum(['f', 'h', 'nb', 'nsp']).nullable().optional(),
  situation: z.enum(['couple', 'separe', 'divorce', 'procedure', 'celibataire', 'autre']).nullable().optional(),
  telephone: optionalText(30).refine(v => !v || /^[0-9+().\s-]{6,30}$/.test(v), code('phoneInvalid')),
  adresse: optionalText(200),
  cp: optionalText(12),
  ville: optionalText(100),
  pays: z.enum(['FR', 'BE', 'CH', 'CA', 'LU']).nullable().optional(),
  photoPath: avatarPathSchema.nullable().optional(),
})

export const preferencesSchema = z.object({
  // fr/en/pt = langues de l'application ; 'es' toléré pour les anciennes préférences enregistrées.
  langue: z.enum(['fr', 'en', 'pt', 'es']),
  fuseau: trimmed(64),
  formatDate: z.enum(['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd']),
  formatHeure: z.enum(['24', '12']),
  notifPush: z.boolean(),
  rappels: z.boolean(),
  rappelHeure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  notifEmail: z.boolean(),
  onMessages: z.boolean(),
  onGarde: z.boolean(),
  onCalendrier: z.boolean(),
  onDocuments: z.boolean(),
  theme: z.enum(['clair', 'sombre', 'auto']),
  couleur: z.enum(['leaf', 'blue', 'iris', 'orange', 'red']),
  taille: z.enum(['petite', 'moyenne', 'grande']),
})

export type PreferencesInput = z.infer<typeof preferencesSchema>

export const changePasswordSchema = z.object({
  current: z.string().min(1, code('currentPasswordRequired')).max(72),
  next: passwordSchema,
})

/** Mot de confirmation de suppression, accepté dans les trois langues de l'interface. */
const DELETE_WORDS = new Set(['SUPPRIMER', 'DELETE', 'EXCLUIR'])

export const deleteAccountSchema = z.object({
  password: z.string().min(1, code('passwordRequired')).max(72),
  confirm: z.string().trim().toUpperCase().refine(v => DELETE_WORDS.has(v), code('confirmDelete')),
})

/**
 * Traduit un message zod : code `auth.validation.*` → texte dans la langue de `t`
 * (par défaut libT : langue du navigateur, français côté serveur). Autre message : inchangé.
 */
export function issueMessage(message: string | undefined, t: AuthTranslate = authT('auth.validation')): string {
  if (!message) return t('invalid')
  if (!message.startsWith(CODE_PREFIX)) return message
  const [key, query] = message.slice(CODE_PREFIX.length).split('?', 2)
  const values = query ? Object.fromEntries(new URLSearchParams(query)) : undefined
  return t(key, values)
}

/**
 * Premier message d'erreur zod, traduit et prêt à afficher.
 * Server Action : `firstIssue(err, await getTranslations('auth.validation'))` (langue du cookie).
 */
export function firstIssue(error: z.ZodError, t: AuthTranslate = authT('auth.validation')): string {
  return issueMessage(error.issues[0]?.message, t)
}
