// Schémas zod des requêtes /api/coparents/** (validés côté serveur ; réutilisés côté client).
import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Adresse e-mail invalide.')
export const guardianRoleSchema = z.enum(['parent', 'proche'])
export const uuidSchema = z.string().uuid()
/** Jeton d'invitation famille : 64 caractères hexadécimaux (0340). */
export const familyTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: guardianRoleSchema,
  childIds: z.array(uuidSchema).min(1, 'Choisissez au moins un enfant.').max(20),
}).strict()

export const acceptSchema = z.union([
  z.object({ token: familyTokenSchema }).strict(),
  z.object({ id: uuidSchema }).strict(),
])

export const previewSchema = z.object({ token: z.string().max(200) }).strict()

export const roleChangeSchema = z.object({ role: guardianRoleSchema }).strict()

export const mergeSchema = z.object({
  dropChildId: uuidSchema,
  keepChildId: uuidSchema,
  /** Case « Je confirme qu'il s'agit du même enfant » cochée. */
  confirm: z.literal(true),
}).strict()

export const dismissSchema = z.object({ myChildId: uuidSchema, sharedChildId: uuidSchema }).strict()

export const sharingPatchSchema = z.object({
  kind: z.enum(['document', 'expense', 'event']),
  id: uuidSchema,
  shared: z.boolean(),
}).strict()

export function isValidEmail(v: string): boolean {
  return emailSchema.safeParse(v).success
}
