/**
 * Modération des comptes (back-office) : avertir, suspendre (durée fixe), désactiver
 * (sans durée), réactiver. Module PUR (ni `server-only`, ni Supabase) : partagé par la
 * route API (validation stricte), la logique serveur (lib/admin/ops/comptes.ts), les
 * composants de l'admin et les tests (tests/admin-moderation.test.ts).
 *
 * Source de vérité de l'état : `auth.users.banned_until` (GoTrue). Une suspension
 * expire seule (ban GoTrue à durée) ; l'affichage dérive donc l'état de la date de fin,
 * jamais d'un drapeau stocké. Une désactivation est un ban « sans fin » (~100 ans, la
 * convention Supabase) : tout ban au-delà d'un an est lu comme une désactivation.
 *
 * Les libellés de ce module sont ceux de l'ADMIN (français). Les textes envoyés à
 * l'utilisateur vivent dans messages/{fr,en,pt}/email.json (clés email.moderation.*).
 */
import { z } from 'zod'

// --- Journal ------------------------------------------------------------------------------

export const MODERATION_KINDS = ['warning', 'suspension', 'deactivation', 'reactivation'] as const
export type ModerationKind = (typeof MODERATION_KINDS)[number]
export const MODERATION_KIND_LABEL: Record<ModerationKind, string> = {
  warning: 'Avertissement', suspension: 'Suspension', deactivation: 'Désactivation', reactivation: 'Réactivation',
}

/** Motifs courants (codes stables : traduits côté utilisateur par email.moderation.reasons.<code>). */
export const MODERATION_REASONS = ['comportement', 'harcelement', 'contenu', 'usurpation', 'spam', 'fraude', 'securite', 'autre'] as const
export type ModerationReason = (typeof MODERATION_REASONS)[number]
export const MODERATION_REASON_LABEL: Record<ModerationReason, string> = {
  comportement: 'Comportement irrespectueux envers d’autres utilisateurs',
  harcelement: 'Harcèlement, menaces ou intimidation',
  contenu: 'Contenu inapproprié ou illicite',
  usurpation: 'Usurpation d’identité ou faux profil',
  spam: 'Spam ou sollicitations abusives',
  fraude: 'Fraude ou usage frauduleux du paiement',
  securite: 'Atteinte à la sécurité du service',
  autre: 'Autre motif (à préciser)',
}

export function isModerationReason(v: unknown): v is ModerationReason {
  return typeof v === 'string' && (MODERATION_REASONS as readonly string[]).includes(v)
}
export function isModerationKind(v: unknown): v is ModerationKind {
  return typeof v === 'string' && (MODERATION_KINDS as readonly string[]).includes(v)
}

export const SUSPENSION_DURATIONS = ['24h', '3d', '7d', '30d'] as const
export type SuspensionDuration = (typeof SUSPENSION_DURATIONS)[number]
export const SUSPENSION_HOURS: Record<SuspensionDuration, number> = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 }
export const DURATION_LABEL: Record<SuspensionDuration, string> = { '24h': '24 heures', '3d': '3 jours', '7d': '7 jours', '30d': '30 jours' }

/** Ban GoTrue d'une désactivation (~100 ans : GoTrue n'a pas de ban « sans fin »). */
export const DEACTIVATION_BAN = '876000h'
/** Au-delà de ce délai, un ban est une désactivation (les suspensions durent 30 jours au plus). */
export const DEACTIVATION_THRESHOLD_MS = 366 * 24 * 3_600_000

export const DETAILS_MAX = 500
export const DETAILS_MIN_OTHER = 10

export type ModerationEntry = {
  id: string
  kind: ModerationKind
  reasonCode: ModerationReason | null
  /** Précisions saisies par l'administrateur (communiquées à l'utilisateur dans l'e-mail). */
  reason: string | null
  /** Fin de suspension (suspension uniquement). */
  until: string | null
  createdAt: string
  adminEmail: string | null
}

// --- État dérivé ------------------------------------------------------------------------------

export type ModerationState = 'actif' | 'non_verifie' | 'suspendu' | 'desactive' | 'supprime'
export const MODERATION_STATES = ['actif', 'non_verifie', 'suspendu', 'desactive', 'supprime'] as const satisfies readonly ModerationState[]

export type ModerationStatus = { state: ModerationState; until: string | null }

/** État d'un compte d'après la suppression, le ban GoTrue et la vérification de l'e-mail. */
export function moderationState(
  p: { deletedAt: string | null; bannedUntil: string | null; emailVerified: boolean },
  now: number = Date.now(),
): ModerationStatus {
  if (p.deletedAt) return { state: 'supprime', until: null }
  const end = p.bannedUntil ? Date.parse(p.bannedUntil) : NaN
  if (Number.isFinite(end) && end > now) {
    if (end - now > DEACTIVATION_THRESHOLD_MS) return { state: 'desactive', until: null }
    return { state: 'suspendu', until: new Date(end).toISOString() }
  }
  return { state: p.emailVerified ? 'actif' : 'non_verifie', until: null }
}

/** Libellé admin de l'état ; `fmt` formate la date de fin (fuseau de l'application). */
export function stateLabel(s: ModerationStatus, fmt: (iso: string) => string): string {
  switch (s.state) {
    case 'actif': return 'Actif'
    case 'non_verifie': return 'Non vérifié'
    case 'suspendu': return s.until ? `Suspendu jusqu’au ${fmt(s.until)}` : 'Suspendu'
    case 'desactive': return 'Désactivé'
    case 'supprime': return 'Supprimé'
  }
}

/** Statut du filtre historique (0400) : suspendu couvre suspension ET désactivation. */
export function legacyStatus(state: ModerationState): 'actif' | 'non_verifie' | 'suspendu' | 'supprime' {
  return state === 'desactive' ? 'suspendu' : state
}

// --- Actions et transitions -------------------------------------------------------------------

export const MOD_ACTIONS = ['warn', 'suspend', 'deactivate', 'reactivate', 'force_logout', 'resend_verification', 'delete'] as const
export type ModAction = (typeof MOD_ACTIONS)[number]

/** Actions envoyées à POST /api/admin/comptes/[id]/actions (la suppression a sa route DELETE). */
export const ACCOUNT_ACTIONS = ['warn', 'suspend', 'deactivate', 'reactivate', 'resend_verification', 'force_logout'] as const
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number]

export const KIND_OF_ACTION = { warn: 'warning', suspend: 'suspension', deactivate: 'deactivation', reactivate: 'reactivation' } as const
export type ModerationAction = keyof typeof KIND_OF_ACTION

export type Availability = { allowed: true } | { allowed: false; code: 'forbidden' | 'conflict'; reason: string }

export type ModerationTarget = {
  state: ModerationState
  until: string | null
  isAdmin: boolean
  isSelf: boolean
  emailVerified: boolean
}

const ok: Availability = { allowed: true }
const no = (code: 'forbidden' | 'conflict', reason: string): Availability => ({ allowed: false, code, reason })

export const REASON_SELF = 'Action impossible sur votre propre compte.'
export const REASON_ADMIN = 'Compte administrateur : il ne se modère pas depuis cet écran (retirez d’abord le rôle administrateur en base).'
export const REASON_DELETED = 'Compte supprimé : aucune action possible (purge automatique sous 30 jours).'

/**
 * Actions possibles sur un compte, avec la raison d'un refus (affichée dans l'interface au lieu
 * de masquer l'action, et renvoyée par l'API). Ordre des refus : supprimé > soi-même > admin > état.
 */
export function actionAvailability(t: ModerationTarget): Record<ModAction, Availability> {
  const all = (a: Availability): Record<ModAction, Availability> =>
    Object.fromEntries(MOD_ACTIONS.map((k) => [k, a])) as Record<ModAction, Availability>
  if (t.state === 'supprime') return all(no('conflict', REASON_DELETED))
  if (t.isSelf) return all(no('forbidden', REASON_SELF))

  const restricted = t.state === 'suspendu' || t.state === 'desactive'
  const admin = t.isAdmin ? no('forbidden', REASON_ADMIN) : null
  return {
    warn: admin ?? ok,
    suspend: admin ?? (t.state === 'desactive'
      ? no('conflict', 'Compte déjà désactivé : réactivez-le d’abord.')
      : t.state === 'suspendu'
        ? no('conflict', 'Compte déjà suspendu : réactivez-le d’abord pour changer la durée.')
        : ok),
    deactivate: admin ?? (t.state === 'desactive' ? no('conflict', 'Compte déjà désactivé.') : ok),
    reactivate: admin ?? (restricted ? ok : no('conflict', 'Le compte n’est ni suspendu ni désactivé.')),
    // La déconnexion forcée reste possible sur un autre administrateur (session compromise).
    force_logout: ok,
    resend_verification: admin ?? (t.emailVerified ? no('conflict', 'L’adresse e-mail de ce compte est déjà vérifiée.') : ok),
    delete: admin ?? ok,
  }
}

export const MOD_ACTION_LABEL: Record<ModAction, string> = {
  warn: 'Avertir', suspend: 'Suspendre', deactivate: 'Désactiver', reactivate: 'Réactiver',
  force_logout: 'Forcer la déconnexion', resend_verification: 'Renvoyer l’e-mail de vérification', delete: 'Supprimer le compte',
}

/**
 * Actions proposées pour un état (les impossibles restent affichées, désactivées, avec leur raison).
 * « Désactiver » ou « Réactiver » selon l'état ; un compte suspendu peut aussi être désactivé.
 */
export function visibleActions(t: Pick<ModerationTarget, 'state' | 'emailVerified'>): ModAction[] {
  const restriction: ModAction[] = t.state === 'suspendu' ? ['reactivate', 'deactivate'] : t.state === 'desactive' ? ['reactivate'] : ['deactivate']
  return ['warn', 'suspend', ...restriction, 'force_logout', ...(t.emailVerified ? [] : ['resend_verification' as const]), 'delete']
}

/** Raison commune à toutes les actions bloquées (soi-même, administrateur, supprimé), sinon null. */
export function targetBlockReason(t: Pick<ModerationTarget, 'state' | 'isAdmin' | 'isSelf'>): string | null {
  if (t.state === 'supprime') return REASON_DELETED
  if (t.isSelf) return REASON_SELF
  if (t.isAdmin) return REASON_ADMIN
  return null
}

// --- Validation (route API et formulaire) -------------------------------------------------------

const details = z.string().trim().max(DETAILS_MAX, `${DETAILS_MAX} caractères au maximum.`)
const reasonFields = {
  reason: z.enum(MODERATION_REASONS, { errorMap: () => ({ message: 'Choisissez un motif.' }) }),
  details: details.optional(),
}

const bodyUnion = z.discriminatedUnion('action', [
  z.object({ action: z.literal('warn'), ...reasonFields }).strict(),
  z.object({
    action: z.literal('suspend'),
    duration: z.enum(SUSPENSION_DURATIONS, { errorMap: () => ({ message: 'Choisissez une durée.' }) }),
    ...reasonFields,
  }).strict(),
  z.object({ action: z.literal('deactivate'), ...reasonFields }).strict(),
  z.object({ action: z.literal('reactivate'), details: details.optional() }).strict(),
  z.object({ action: z.literal('resend_verification') }).strict(),
  z.object({ action: z.literal('force_logout') }).strict(),
])

/** Corps de POST /api/admin/comptes/[id]/actions. Motif « autre » : précisions obligatoires. */
export const actionBodySchema = bodyUnion.superRefine((b, ctx) => {
  if ('reason' in b && b.reason === 'autre' && (b.details ?? '').length < DETAILS_MIN_OTHER) {
    ctx.addIssue({ code: 'custom', path: ['details'], message: `Précisez le motif (${DETAILS_MIN_OTHER} caractères minimum).` })
  }
})
export type ActionBody = z.infer<typeof bodyUnion>

// --- Durées et ban GoTrue -----------------------------------------------------------------------

/** Fin d'une suspension commencée à `now`. */
export function suspensionUntil(d: SuspensionDuration, now: number = Date.now()): string {
  return new Date(now + SUSPENSION_HOURS[d] * 3_600_000).toISOString()
}

/** `ban_duration` GoTrue d'une action de modération (null : pas de changement de ban). */
export function banDurationFor(b: ActionBody): string | null {
  if (b.action === 'suspend') return `${SUSPENSION_HOURS[b.duration]}h`
  if (b.action === 'deactivate') return DEACTIVATION_BAN
  if (b.action === 'reactivate') return 'none'
  return null
}

/** `ban_duration` qui rétablit un ban antérieur (annulation si le journal n'a pas pu être écrit). */
export function restoreBanDuration(previousBannedUntil: string | null, now: number = Date.now()): string {
  const end = previousBannedUntil ? Date.parse(previousBannedUntil) : NaN
  if (!Number.isFinite(end) || end <= now) return 'none'
  return `${Math.ceil((end - now) / 3_600_000)}h`
}

/** « 7 jours » d'après les dates d'une suspension (durée inconnue : en heures). */
export function durationLabelOf(createdAt: string, until: string | null): string | null {
  if (!until) return null
  const h = Math.round((Date.parse(until) - Date.parse(createdAt)) / 3_600_000)
  if (!Number.isFinite(h) || h <= 0) return null
  const known = SUSPENSION_DURATIONS.find((d) => SUSPENSION_HOURS[d] === h)
  return known ? DURATION_LABEL[known] : `${h} h`
}
