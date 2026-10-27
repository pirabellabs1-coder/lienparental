/**
 * Schémas zod partagés client / serveur.
 * Côté serveur ils sont la barrière de confiance ; côté client ils ne
 * servent qu'à afficher les erreurs plus tôt.
 */
import { z } from 'zod'

const trimmed = (max: number) => z.string().trim().max(max, `${max} caractères maximum.`)

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Indiquez une adresse e-mail valide.')
  .max(254, 'Adresse e-mail trop longue.')
  .email('Indiquez une adresse e-mail valide.')

/**
 * Mêmes règles que components/onboarding/PasswordField (PASSWORD_RULES) ET que la politique
 * GoTrue du projet (docs/MISE_EN_SERVICE.md §1.4 : 8 caractères, minuscule, majuscule, chiffre).
 */
export const passwordSchema = z
  .string()
  .min(8, '8 caractères minimum.')
  .max(72, '72 caractères maximum.') // limite bcrypt de GoTrue
  .refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v), '1 lettre minuscule et 1 lettre majuscule minimum.')
  .refine(v => /[0-9]/.test(v), '1 chiffre minimum.')

export const otpSchema = z.string().regex(/^\d{6}$/, 'Le code contient 6 chiffres.')

export const nameSchema = trimmed(80).min(1, 'Champ obligatoire.')

export const profileNamesSchema = z.object({
  prenom: nameSchema,
  nom: nameSchema,
})

/** Chemin d'avatar : toujours dans le dossier de l'utilisateur (vérifié côté serveur). */
export const avatarPathSchema = z
  .string()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp)$/, 'Chemin de photo invalide.')

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.')

export const childSchema = z.object({
  id: z.string().uuid().optional(),
  prenom: nameSchema,
  dateNaissance: isoDate.refine(v => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d <= new Date() && d.getUTCFullYear() >= 1990
  }, 'Indiquez une date de naissance valide.'),
  classe: trimmed(60).optional().nullable(),
  photoPath: avatarPathSchema.optional().nullable(),
})

const optionalText = (max: number) =>
  z.string().trim().max(max, `${max} caractères maximum.`).transform(v => (v === '' ? null : v)).nullable().optional()

export const accountInfoSchema = z.object({
  prenom: nameSchema,
  nom: nameSchema,
  dateNaissance: z.union([isoDate, z.literal('')]).optional().transform(v => (v ? v : null)),
  genre: z.enum(['f', 'h', 'nb', 'nsp']).nullable().optional(),
  situation: z.enum(['couple', 'separe', 'divorce', 'procedure', 'celibataire', 'autre']).nullable().optional(),
  telephone: optionalText(30).refine(v => !v || /^[0-9+().\s-]{6,30}$/.test(v), 'Numéro de téléphone invalide.'),
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
  current: z.string().min(1, 'Saisissez votre mot de passe actuel.').max(72),
  next: passwordSchema,
})

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(72),
  confirm: z.string().trim().toUpperCase().refine(v => v === 'SUPPRIMER', 'Tapez SUPPRIMER pour confirmer.'),
})

/** Premier message d'erreur zod, pour l'afficher tel quel. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Informations invalides.'
}
