// Cœur PUR de la synchronisation Stripe → base (abonnement + users.plan).
// Aucune dépendance serveur : le stockage est injecté (Supabase en production,
// mémoire dans les tests). Utilisé par le webhook, le retour de Checkout, le
// retour du portail et les actions de gestion : un seul chemin d'écriture.
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/supabase/types'
import type { PlanId } from '@/components/profil/pricing'
import { BILLING_GRACE_DAYS } from './config'
import { dbTierFor, offerFromSubscriptionPlan } from './plans'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export type SubscriptionRecord = {
  id: string
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_end: string | null
}

/** Statuts pour lesquels un abonnement « existe encore » (on n'en crée pas un second). */
const BLOCKING_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'unpaid', 'paused']
export function isBlockingStatus(status: SubscriptionStatus | null | undefined): boolean {
  return !!status && BLOCKING_STATUSES.includes(status)
}

/**
 * Règle d'accès payant (CDC §6.1) :
 *  - active / trialing → avantages ouverts ;
 *  - past_due → avantages conservés pendant `graceDays` après le début de la
 *    période impayée (Stripe relance la carte pendant ce temps) ;
 *  - tout le reste (unpaid, canceled, incomplete…) → Gratuit.
 */
export function isPremium(
  sub: Pick<SubscriptionRecord, 'status' | 'current_period_start'> | null,
  now: Date = new Date(),
  graceDays: number = BILLING_GRACE_DAYS,
): boolean {
  if (!sub) return false
  if (sub.status === 'active' || sub.status === 'trialing') return true
  if (sub.status === 'past_due') {
    const start = sub.current_period_start ? Date.parse(sub.current_period_start) : now.getTime()
    return now.getTime() < start + graceDays * 86_400_000
  }
  return false
}

/** Niveau ouvert par un abonnement local (règle d'accès + formule souscrite). */
export function planOf(sub: Pick<SubscriptionRecord, 'status' | 'current_period_start' | 'plan'> | null, now: Date = new Date()): PlanId {
  return sub && isPremium(sub, now) ? offerFromSubscriptionPlan(sub.plan).plan : 'gratuit'
}

/** Instantané minimal d'un abonnement Stripe (relu chez Stripe, jamais le payload d'un vieil événement). */
export type SubscriptionSnapshot = {
  id: string
  customerId: string | null
  status: SubscriptionStatus
  /** null : Price inconnu (ni variable d'environnement, ni metadata du script) → aucun droit accordé. */
  plan: SubscriptionPlan | null
  metadataUserId: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_end: string | null
  /** Instant de la lecture chez Stripe (version : une lecture plus ancienne n'écrase jamais une plus récente). */
  observedAt: string
}

export type SubscriptionRow = Omit<SubscriptionRecord, 'id'>

export type ApplyOutcome =
  | { outcome: 'ok'; record: SubscriptionRecord; previous: SubscriptionRecord | null }
  | { outcome: 'outdated' | 'stale' | 'unknown_user' }

/** Accès au stockage, injecté (Supabase service_role en production, mémoire dans les tests). */
export interface BillingStore {
  userIdForCustomer(customerId: string): Promise<string | null>
  getByUser(userId: string): Promise<SubscriptionRecord | null>
  /**
   * Écriture ATOMIQUE (public.billing_apply_subscription, 0460) : verrou par utilisateur,
   * version `observedAt`, garde « ancien abonnement terminé », abonnement + users.plan
   * dans la même transaction (un administrateur reste administrateur).
   */
  apply(row: SubscriptionRow, tier: 'free' | 'premium' | 'coparentalite', observedAt: string): Promise<ApplyOutcome>
  /** Lien user ↔ customer, premier arrivé gagne (jamais d'écrasement). */
  linkCustomer(userId: string, customerId: string): Promise<void>
}

export type SyncOptions = {
  /** Vérifie chez Stripe qu'un abonnement est TOUJOURS en cours (détection de doublon). */
  stillBlocking?(subscriptionId: string): Promise<boolean>
}

export type UpsertResult =
  | { ok: true; userId: string; record: SubscriptionRecord; previous: SubscriptionRecord | null }
  | { ok: false; reason: 'unknown_user' | 'stale' | 'outdated' | 'unknown_price' }
  /** Second abonnement en cours pour le même utilisateur : à résilier et rembourser par l'appelant. */
  | { ok: false; reason: 'duplicate'; userId: string; keptId: string; duplicateId: string }

/** Résout l'utilisateur applicatif d'un objet Stripe, sans jamais se fier à l'e-mail. */
export async function resolveUserIdWith(
  store: Pick<BillingStore, 'userIdForCustomer'>,
  metadataUserId: string | null | undefined,
  customerId: string | null,
  hint?: string | null,
): Promise<string | null> {
  if (customerId) {
    const linked = await store.userIdForCustomer(customerId)
    if (linked) return linked
  }
  if (isUuid(metadataUserId)) return metadataUserId
  if (isUuid(hint)) return hint
  return null
}

/**
 * Reflète un abonnement Stripe dans public.subscriptions ET public.users.plan.
 * Idempotent : rejouer le même instantané produit le même état, sans effet de bord.
 * Une seule ligne par utilisateur : un ancien abonnement terminé n'écrase jamais
 * l'abonnement en cours ; une lecture Stripe plus ancienne n'écrase jamais une plus
 * récente ; un second abonnement en cours est signalé ('duplicate'), jamais écrit.
 */
export async function applySubscriptionSnapshot(
  store: BillingStore,
  snap: SubscriptionSnapshot,
  userIdHint?: string | null,
  opts: SyncOptions = {},
): Promise<UpsertResult> {
  if (!snap.customerId) return { ok: false, reason: 'unknown_user' }
  if (!snap.plan) {
    console.error('[billing] Price Stripe inconnu : aucun droit accordé', { sub: snap.id })
    return { ok: false, reason: 'unknown_price' }
  }
  const userId = await resolveUserIdWith(store, snap.metadataUserId, snap.customerId, userIdHint)
  if (!userId) return { ok: false, reason: 'unknown_user' }

  const previous = await store.getByUser(userId)
  if (previous && previous.stripe_subscription_id !== snap.id && isBlockingStatus(previous.status)) {
    if (!isBlockingStatus(snap.status)) return { ok: false, reason: 'stale' }
    // Deux abonnements en cours : on garde celui déjà enregistré s'il l'est toujours chez Stripe.
    const prevAlive = opts.stillBlocking ? await opts.stillBlocking(previous.stripe_subscription_id) : true
    if (prevAlive) {
      console.error('[billing] ALERTE abonnement en double', { user: userId, kept: previous.stripe_subscription_id, duplicate: snap.id })
      return { ok: false, reason: 'duplicate', userId, keptId: previous.stripe_subscription_id, duplicateId: snap.id }
    }
  }

  const row: SubscriptionRow = {
    user_id: userId,
    stripe_customer_id: snap.customerId,
    stripe_subscription_id: snap.id,
    plan: snap.plan,
    status: snap.status,
    current_period_start: snap.current_period_start,
    current_period_end: snap.current_period_end,
    cancel_at_period_end: snap.cancel_at_period_end,
    canceled_at: snap.canceled_at,
    trial_end: snap.trial_end,
  }
  // users.plan alimente le plan effectif SQL (effective_plan, 0380 : accès partagé, priorité support, quotas).
  const tier = dbTierFor(planOf(row))
  const res = await store.apply(row, tier, snap.observedAt)
  if (res.outcome !== 'ok') return { ok: false, reason: res.outcome }

  await store.linkCustomer(userId, snap.customerId)
  return { ok: true, userId, record: res.record, previous: res.previous }
}
