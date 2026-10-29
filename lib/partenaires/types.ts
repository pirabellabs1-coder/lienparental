/**
 * Candidature « Devenir partenaire » (page publique /partenaires/candidature).
 * Schéma zod partagé par le client (validation à la soumission) et le serveur (route API).
 * Aucune donnée en base en V1 : la candidature part en e-mail chez partenaires@lienparental.fr.
 */
import { z } from 'zod'

export const PARTNER_PROFILES = ['association', 'institution', 'professionnel', 'createur'] as const
export type PartnerProfile = (typeof PARTNER_PROFILES)[number]

/** Codes de territoire acceptés sur ce formulaire (même liste que le Guide + « autre »). */
export const PARTNER_TERRITORIES = ['guyane', 'france', 'martinique', 'guadeloupe', 'reunion', 'mayotte', 'autre'] as const
export type PartnerTerritory = (typeof PARTNER_TERRITORIES)[number]

/** URL http(s) seule, 2000 caractères max. Vide = champ facultatif non rempli. */
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || /^https?:\/\//i.test(v), { message: 'invalidUrl' })

/** Téléphone : chiffres, espaces, « + » et « - » autorisés, 25 caractères max. */
const optionalPhone = z
  .string()
  .trim()
  .max(25)
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || /^[+\d][\d\s().-]{5,}$/.test(v), { message: 'invalidPhone' })

/** Caractères invisibles ou d'inversion de sens (U+200B…U+200F, U+202A…U+202E, U+2066…U+2069) : retirés. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(INVISIBLE, '') : v)
const text = (min: number, max: number, msg: string) => z.preprocess(clean, z.string().trim().min(min, msg).max(max))

/** Catégorie d'affichage proposée d'après le profil déclaré (modifiable à la validation). */
export const CATEGORY_FOR_PROFILE = {
  association: 'association',
  institution: 'institution',
  professionnel: 'professionnel',
  createur: 'createur',
} as const satisfies Record<PartnerProfile, 'institution' | 'association' | 'createur' | 'professionnel'>

/** Logo (ou photo pour un créateur) : PNG, JPEG ou WebP, 2 Mo au plus, type vérifié sur les octets. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
export const LOGO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const
export type LogoMime = keyof typeof LOGO_EXT

export const partnerApplicationSchema = z.object({
  profil: z.enum(PARTNER_PROFILES),
  // Identité de la structure
  structure: text(2, 120, 'required'),
  contactName: text(2, 120, 'required'),
  email: z.string().trim().toLowerCase().email('invalidEmail').max(254),
  telephone: optionalPhone,
  territoire: z.enum(PARTNER_TERRITORIES),
  // Activité
  site: optionalUrl,
  reseaux: z.string().trim().max(1000).optional().transform((v) => (v === '' ? undefined : v)),
  presentation: text(30, 2000, 'tooShort'),
  // Proposition
  proposition: text(30, 2000, 'tooShort'),
  // Confidentialité (case cochée)
  consent: z.literal(true, { errorMap: () => ({ message: 'required' }) }),
})

export type PartnerApplication = z.infer<typeof partnerApplicationSchema>
