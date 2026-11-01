/** Agent d'accueil — validation des entrées publiques (chatbot ; demain WhatsApp et téléphone). */
import { z } from 'zod'

/** Adresse ramenée à sa boîte réelle (sans +étiquette ; sans points chez Gmail) pour les plafonds. */
export function mailboxKey(email: string): string {
  const [local = '', domain = ''] = email.toLowerCase().split('@')
  const base = local.split('+')[0]!
  return `${domain === 'gmail.com' || domain === 'googlemail.com' ? base.replace(/\./g, '') : base}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`
}

export const AgentLocaleSchema = z.enum(['fr', 'en', 'pt'])
const Code = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/)
const Name = z.string().trim().min(2).max(120)
const Phone = z.string().trim().regex(/^\+?[0-9 ().-]{6,20}$/).transform((v) => v.replace(/[^\d+]/g, ''))
const Email = z.string().trim().toLowerCase().email().max(254)
const Iso = z.string().datetime({ offset: true })

export const SlotsQuerySchema = z.object({ type: Code, lang: AgentLocaleSchema, after: Iso.optional() })

export const BookSchema = z.object({
  type: Code,
  lang: AgentLocaleSchema,
  start: Iso,
  name: Name,
  phone: Phone.optional(),
  // Site : l'e-mail est obligatoire, il sert à confirmer la réservation (double validation).
  email: Email,
  reason: z.string().trim().max(500).optional(),
  remindersConsent: z.boolean().default(false),
  // Champ piège invisible : rempli par un robot, la demande est acceptée en apparence et ignorée.
  website: z.string().max(200).optional(),
})

export const CallbackSchema = z.object({
  lang: AgentLocaleSchema,
  name: Name,
  phone: Phone,
  reason: z.string().trim().min(2).max(500),
  service: Code.optional(),
  website: z.string().max(200).optional(),
})

export const HumanQuerySchema = z.object({ service: Code, lang: AgentLocaleSchema })

export const ManageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('reschedule'), start: Iso }),
])
