// Schémas zod des requêtes /api/coparents/** (validés côté serveur ; réutilisés côté client).
// Les messages d'erreur sont des CODES, traduits par la route (server.coparents.validation.<code>).
import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalidEmail')
export const guardianRoleSchema = z.enum(['parent', 'proche'])
export const uuidSchema = z.string().uuid()
/** Jeton d'invitation famille : 64 caractères hexadécimaux (0340). */
export const familyTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: guardianRoleSchema,
  childIds: z.array(uuidSchema).min(1, 'chooseChild').max(20),
}).strict()

/**
 * Mode démonstration uniquement (aucun serveur) : les fiches fictives ont des identifiants
 * lisibles (« c_1 », « c_demo_emma »), pas des UUID. Mêmes règles sinon. Le serveur
 * (/api/coparents/invitations) et le mode Supabase gardent createInvitationSchema (UUID).
 */
export const demoChildIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export const demoCreateInvitationSchema = createInvitationSchema.extend({
  childIds: z.array(demoChildIdSchema).min(1, 'chooseChild').max(20),
}).strict()

/** Codes d'erreur de validation connus (traduits côté client : auth.family.<code>). */
export const INVITATION_ERROR_CODES = ['invalidEmail', 'chooseChild'] as const
export function invitationErrorCode(message: string | undefined): 'invalidEmail' | 'chooseChild' | 'invalid' {
  return (INVITATION_ERROR_CODES as readonly string[]).includes(message ?? '')
    ? (message as 'invalidEmail' | 'chooseChild')
    : 'invalid'
}

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
