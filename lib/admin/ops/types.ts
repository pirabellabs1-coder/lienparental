/**
 * Back-office opérationnel (mission M6) : comptes, support, journal d'audit,
 * modération des témoignages. Module PUR : types, libellés et schémas des filtres
 * (lus depuis l'URL), partagés par les pages serveur, les routes et les composants.
 *
 * Minimisation : aucun type ne porte de contenu du Journal, du coffre, des
 * témoignages, de la messagerie ni de données de santé.
 */
import { z } from 'zod'

// --- Comptes ---------------------------------------------------------------------

export const ACCOUNT_PLANS = ['free', 'premium', 'coparentalite', 'admin'] as const
export type AccountPlan = (typeof ACCOUNT_PLANS)[number]
export const PLAN_LABEL: Record<AccountPlan, string> = {
  free: 'Gratuit', premium: 'Premium', coparentalite: 'Coparentalité+', admin: 'Administrateur',
}

export const ACCOUNT_STATUSES = ['actif', 'non_verifie', 'suspendu', 'supprime'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]
export const STATUS_LABEL: Record<AccountStatus, string> = {
  actif: 'Actif', non_verifie: 'E-mail non vérifié', suspendu: 'Suspendu', supprime: 'Supprimé (purge sous 30 jours)',
}

export type AccountRow = {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  plan: AccountPlan
  status: AccountStatus
  createdAt: string
  lastSignInAt: string | null
  emailVerified: boolean
  mfaEnabled: boolean
  storageMb: number
  childrenCount: number
}

export type AccountSession = { createdAt: string; lastSeenAt: string; device: string; aal: string | null }
export type AccountSubscription = {
  plan: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  createdAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}
export type AccountPayment = { amountCents: number; currency: string; status: string; paidAt: string | null; createdAt: string }
export type AccountAuditLine = { id: string; action: string; actorType: string; createdAt: string }

export type AccountDetail = {
  profile: AccountRow & { deletedAt: string | null; bannedUntil: string | null }
  effective: { plan: 'free' | 'premium' | 'coparentalite'; ownPlan: string; via: 'abonnement' | 'famille' | null }
  sessions: AccountSession[]
  subscription: AccountSubscription | null
  payments: AccountPayment[]
  audit: AccountAuditLine[]
  openTickets: number
}

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v == null ? undefined : v), s.optional())

export const accountFiltersSchema = z.object({
  q: opt(z.string().trim().max(120)),
  plan: opt(z.enum(ACCOUNT_PLANS)),
  statut: opt(z.enum(ACCOUNT_STATUSES)),
  du: opt(dayKey),
  au: opt(dayKey),
  apres: opt(z.string().max(200)),
})
export type AccountFilters = z.infer<typeof accountFiltersSchema>

export const ACCOUNT_ACTIONS = ['suspend', 'reactivate', 'resend_verification', 'force_logout'] as const
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number]

// --- Support -----------------------------------------------------------------------

export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Ouvert', in_progress: 'En cours', waiting_user: 'En attente de l’utilisateur', resolved: 'Résolu', closed: 'Fermé',
}

export const TICKET_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: 'Urgente', high: 'Haute (Coparentalité+)', normal: 'Normale (Premium)', low: 'Basse (Gratuit)',
}

export const TICKET_CATEGORIES = ['contact', 'bug', 'technique', 'suggestion', 'abus', 'autre'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  contact: 'Contact', bug: 'Bug', technique: 'Problème technique', suggestion: 'Suggestion', abus: 'Signalement d’abus', autre: 'Autre',
}

export type TicketRow = {
  id: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  updatedAt: string
  lastReplyAt: string | null
  lastReplyBy: 'user' | 'admin' | null
  userId: string
  userEmail: string | null
  messageCount: number
}

export type TicketMessage = { id: string; from: 'user' | 'admin'; body: string; at: string; authorId?: string | null }

export type TicketDetail = {
  id: string
  subject: string
  body: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority
  messages: TicketMessage[]
  createdAt: string
  updatedAt: string
  closedAt: string | null
  requester: { id: string; email: string; prenom: string | null; plan: string; deleted: boolean }
}

export const ticketFiltersSchema = z.object({
  statut: opt(z.enum([...TICKET_STATUSES, 'en_cours'])),
  priorite: opt(z.enum(TICKET_PRIORITIES)),
  categorie: opt(z.enum(TICKET_CATEGORIES)),
  q: opt(z.string().trim().max(120)),
  page: opt(z.coerce.number().int().min(1).max(100)),
})
export type TicketFilters = z.infer<typeof ticketFiltersSchema>

/** Création d'un ticket par un utilisateur (centre d'aide). */
export const newTicketSchema = z.object({
  subject: z.string().trim().min(1, 'Renseignez un objet.').max(160, '160 caractères au maximum.'),
  body: z.string().trim().min(10, 'Message trop court (10 caractères minimum).').max(8000, '8000 caractères au maximum.'),
  category: z.enum(TICKET_CATEGORIES).default('contact'),
})

// --- Journal d'audit -----------------------------------------------------------------

export type AuditRow = {
  id: string
  createdAt: string
  action: string
  actorType: 'user' | 'admin' | 'system' | 'witness' | string
  actorEmail: string | null
  subjectId: string | null
  entity: string | null
  entityId: string | null
  metadata: Record<string, unknown>
}

export const auditFiltersSchema = z.object({
  categorie: opt(z.enum(['admin', 'securite'])),
  action: opt(z.string().regex(/^[a-z_.]{1,80}$/)),
  compte: opt(z.string().uuid()),
  du: opt(dayKey),
  au: opt(dayKey),
  avant: opt(z.string().regex(/^\d{1,18}$/)),
})
export type AuditFilters = z.infer<typeof auditFiltersSchema>

/** Libellés lisibles des actions connues (les autres s'affichent telles quelles). */
export const ACTION_LABEL: Record<string, string> = {
  'admin.account.suspend': 'Compte suspendu',
  'admin.account.reactivate': 'Compte réactivé',
  'admin.account.resend_verification': 'E-mail de vérification renvoyé',
  'admin.account.force_logout': 'Déconnexion forcée',
  'admin.account.delete': 'Compte supprimé (administration)',
  'admin.account.export': 'Export CSV des comptes',
  'admin.support.reply': 'Réponse au support',
  'admin.support.update': 'Ticket modifié',
  'admin.testimony.revoke': 'Lien de témoignage révoqué',
  'admin.content.create': 'Contenu créé',
  'admin.content.update': 'Contenu modifié',
  'admin.content.publish': 'Contenu publié',
  'admin.content.unpublish': 'Contenu dépublié',
  'admin.content.archive': 'Contenu archivé',
  'admin.content.delete': 'Contenu supprimé',
  'account.delete': 'Suppression du compte (utilisateur)',
  'account.export': 'Export des données (utilisateur)',
  'security.email_changed': 'Adresse e-mail modifiée',
  'security.password_changed': 'Mot de passe modifié',
  'security.mfa_enabled': 'Double authentification activée',
  'security.mfa_removed': 'Double authentification retirée',
  'security.banned': 'Connexion bloquée',
  'security.unbanned': 'Connexion rétablie',
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

// --- Témoignages (modération par métadonnées) -----------------------------------------

export const TESTIMONY_STATUSES = ['pending', 'opened', 'in_progress', 'submitted', 'expired', 'revoked'] as const
export type TestimonyStatus = (typeof TESTIMONY_STATUSES)[number]
export const TESTIMONY_STATUS_LABEL: Record<TestimonyStatus, string> = {
  pending: 'Envoyée', opened: 'Ouverte par le témoin', in_progress: 'En cours de rédaction',
  submitted: 'Témoignage reçu', expired: 'Expirée', revoked: 'Révoquée',
}

export type TestimonyRequestRow = {
  id: string
  userId: string
  status: TestimonyStatus
  createdAt: string
  expiresAt: string
  openedAt: string | null
  submittedAt: string | null
  revokedAt: string | null
  hasTestimony: boolean
}

export type TestimonyOverview = {
  byStatus: Partial<Record<TestimonyStatus, number>>
  requests30d: number
  submitted30d: number
  reportsOpen: number
}

export const REVOKE_REASONS = ['signalement_abus', 'demande_parent', 'securite', 'autre'] as const
export type RevokeReason = (typeof REVOKE_REASONS)[number]
export const REVOKE_REASON_LABEL: Record<RevokeReason, string> = {
  signalement_abus: 'Signalement d’abus', demande_parent: 'Demande du parent', securite: 'Incident de sécurité', autre: 'Autre motif',
}

export const testimonyFiltersSchema = z.object({
  statut: opt(z.enum(TESTIMONY_STATUSES)),
  compte: opt(z.string().uuid()),
  apres: opt(z.string().max(200)),
})
export type TestimonyFilters = z.infer<typeof testimonyFiltersSchema>

// --- Utilitaires -----------------------------------------------------------------------

/** Lit des searchParams Next (valeurs string | string[]) en objet simple. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v
    if (typeof s === 'string') out[k] = s
  }
  return out
}

/** Curseur opaque (date de création + identifiant) pour la pagination stable. */
export function encodeCursor(createdAt: string, id: string): string {
  const raw = `${createdAt}|${id}`
  return typeof btoa === 'function' ? btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : Buffer.from(raw).toString('base64url')
}

export function decodeCursor(c: string | undefined): { createdAt: string; id: string } | null {
  if (!c || !/^[A-Za-z0-9_-]{1,200}$/.test(c)) return null
  try {
    const b64 = c.replace(/-/g, '+').replace(/_/g, '/')
    const raw = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
    const [createdAt, id] = raw.split('|')
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) return null
    if (!/^[0-9a-z_-]{1,64}$/i.test(id ?? '')) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

/** Résumé d'un User-Agent : navigateur et système (jamais la chaîne brute à l'écran). */
export function deviceLabel(ua: string): string {
  if (!ua) return 'Appareil inconnu'
  const os = /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Système inconnu'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur inconnu'
  return `${browser} · ${os}`
}
