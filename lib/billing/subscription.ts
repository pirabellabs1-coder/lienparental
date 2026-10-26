import 'server-only'
import type Stripe from 'stripe'
import type { SubscriptionStatus } from '@/lib/supabase/types'
import { BILLING_GRACE_DAYS, BILLING_LIVE } from './config'
import { billingDb, SUBSCRIPTION_COLUMNS, type SubscriptionRecord } from './db'
import type { PlanId } from '@/components/profil/pricing'
import { dbTierFor } from './plans'
import { offerFromPlan, offerFromPrice, planFromOffer } from './prices'
import { getStripe, idOf } from './stripe'

/** Niveau propre d'un utilisateur : 'gratuit' | 'premium' | 'coparentalite'. */
export type UserPlan = PlanId

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

/** Statuts pour lesquels un abonnement « existe encore » (on n'en crée pas un second). */
const BLOCKING_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'unpaid', 'paused']
export function isBlockingStatus(status: SubscriptionStatus): boolean {
  return BLOCKING_STATUSES.includes(status)
}

const toIso = (unix: number | null | undefined): string | null =>
  typeof unix === 'number' && unix > 0 ? new Date(unix * 1000).toISOString() : null

/**
 * Règle d'accès Premium (CDC §6.1) :
 *  - active / trialing → Premium ;
 *  - past_due → Premium pendant BILLING_GRACE_DAYS après le début de la période
 *    impayée (Stripe relance la carte pendant ce temps) ;
 *  - tout le reste (unpaid, canceled, incomplete…) → Gratuit (lecture seule au-delà du quota gratuit).
 */
export function isPremium(
  sub: Pick<SubscriptionRecord, 'status' | 'current_period_start'> | null,
  now: Date = new Date(),
): boolean {
  if (!sub) return false
  if (sub.status === 'active' || sub.status === 'trialing') return true
  if (sub.status === 'past_due') {
    const start = sub.current_period_start ? Date.parse(sub.current_period_start) : now.getTime()
    return now.getTime() < start + BILLING_GRACE_DAYS * 86_400_000
  }
  return false
}

/** Abonnement local (reflet Stripe) d'un utilisateur, ou null. */
export async function getSubscription(userId: string): Promise<SubscriptionRecord | null> {
  if (!BILLING_LIVE || !isUuid(userId)) return null
  const { data, error } = await billingDb()
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`subscriptions read failed: ${error.code ?? 'unknown'}`)
  return (data as SubscriptionRecord | null) ?? null
}

/** Niveau ouvert par un abonnement local (règle d'accès isPremium + formule souscrite). */
export function planOf(sub: Pick<SubscriptionRecord, 'status' | 'current_period_start' | 'plan'> | null, now: Date = new Date()): UserPlan {
  return sub && isPremium(sub, now) ? offerFromPlan(sub.plan).plan : 'gratuit'
}

/**
 * Niveau propre d'un utilisateur (son abonnement), hors accès partagé.
 * Pour les droits, utiliser getEffectivePlan (lib/billing/entitlements.ts).
 * Hors facturation réelle : toujours 'gratuit'.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  return planOf(await getSubscription(userId))
}

// --- Customers -----------------------------------------------------------

export async function getCustomerId(userId: string): Promise<string | null> {
  if (!isUuid(userId)) return null
  const { data, error } = await billingDb()
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`billing_customers read failed: ${error.code ?? 'unknown'}`)
  return (data as { stripe_customer_id: string } | null)?.stripe_customer_id ?? null
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await billingDb()
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (error) throw new Error(`billing_customers read failed: ${error.code ?? 'unknown'}`)
  return (data as { user_id: string } | null)?.user_id ?? null
}

/** Enregistre le lien user ↔ customer (premier arrivé gagne, jamais d'écrasement). */
async function linkCustomer(userId: string, customerId: string): Promise<void> {
  const { error } = await billingDb()
    .from('billing_customers')
    .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id', ignoreDuplicates: true })
  // 23505 : ce customer est déjà lié (à ce user ou, anomalie, à un autre) — on n'écrase rien.
  if (error && error.code !== '23505') throw new Error(`billing_customers write failed: ${error.code ?? 'unknown'}`)
}

/**
 * Customer Stripe de l'utilisateur, créé au besoin. La clé d'idempotence Stripe
 * empêche deux créations concurrentes (double clic, deux onglets) ; la table
 * garantit l'unicité côté base.
 */
export async function getOrCreateCustomer(user: { id: string; email: string; prenom?: string; nom?: string }): Promise<string> {
  const existing = await getCustomerId(user.id)
  if (existing) return existing

  const name = [user.prenom, user.nom].filter(Boolean).join(' ').trim()
  const customer = await getStripe().customers.create(
    {
      email: user.email || undefined,
      name: name || undefined,
      preferred_locales: ['fr'],
      metadata: { user_id: user.id },
    },
    { idempotencyKey: `customer-create-${user.id}` },
  )
  await linkCustomer(user.id, customer.id)
  // Relecture : en cas de course, c'est la ligne en base qui fait foi.
  return (await getCustomerId(user.id)) ?? customer.id
}

// --- Synchronisation depuis Stripe ----------------------------------------

export type UpsertResult =
  | { ok: true; userId: string; record: SubscriptionRecord; previous: SubscriptionRecord | null }
  | { ok: false; reason: 'unknown_user' | 'stale' }

/** Résout l'utilisateur applicatif d'un objet Stripe, sans jamais se fier à l'e-mail. */
export async function resolveUserId(
  metadataUserId: string | null | undefined,
  customerId: string | null,
  hint?: string | null,
): Promise<string | null> {
  if (customerId) {
    const linked = await userIdForCustomer(customerId)
    if (linked) return linked
  }
  if (isUuid(metadataUserId)) return metadataUserId
  if (isUuid(hint)) return hint
  return null
}

/**
 * Reflète un abonnement Stripe dans public.subscriptions et public.users.plan.
 * Idempotent : peut être rejoué sans effet de bord. L'appelant doit passer un
 * objet fraîchement relu chez Stripe (pas le payload d'un vieil événement) pour
 * ne pas dépendre de l'ordre de livraison des webhooks.
 */
export async function upsertFromStripe(sub: Stripe.Subscription, userIdHint?: string | null): Promise<UpsertResult> {
  const customerId = idOf(sub.customer)
  if (!customerId) return { ok: false, reason: 'unknown_user' }
  const userId = await resolveUserId(sub.metadata?.user_id, customerId, userIdHint)
  if (!userId) return { ok: false, reason: 'unknown_user' }

  const db = billingDb()
  const { data: prevData, error: prevErr } = await db
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (prevErr) throw new Error(`subscriptions read failed: ${prevErr.code ?? 'unknown'}`)
  const previous = (prevData as SubscriptionRecord | null) ?? null

  const status = sub.status as SubscriptionStatus
  // Une seule ligne par utilisateur : un ancien abonnement terminé ne doit pas
  // écraser l'abonnement en cours (réabonnement après résiliation).
  if (previous && previous.stripe_subscription_id !== sub.id && isBlockingStatus(previous.status) && !isBlockingStatus(status)) {
    return { ok: false, reason: 'stale' }
  }

  const price = sub.items.data[0]?.price
  const row = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: planFromOffer(offerFromPrice(price)),
    status,
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: toIso(sub.canceled_at),
    trial_end: toIso(sub.trial_end),
  }

  const { data, error } = await db
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' })
    .select(SUBSCRIPTION_COLUMNS)
    .single()
  if (error) {
    // 23503 : l'utilisateur n'existe plus (compte supprimé) → rien à refléter.
    if (error.code === '23503') return { ok: false, reason: 'unknown_user' }
    throw new Error(`subscriptions upsert failed: ${error.code ?? 'unknown'}`)
  }
  const record = data as SubscriptionRecord

  await linkCustomer(userId, customerId)

  // users.plan alimente le plan effectif SQL (effective_plan, 0380 : accès partagé
  // de la famille, priorité support, quotas). Un admin reste admin.
  const { error: planErr } = await db
    .from('users')
    .update({ plan: dbTierFor(planOf(record)) })
    .eq('id', userId)
    .neq('plan', 'admin')
  if (planErr) throw new Error(`users.plan sync failed: ${planErr.code ?? 'unknown'}`)

  return { ok: true, userId, record, previous }
}

/** Relit l'abonnement chez Stripe puis le reflète (source de vérité = Stripe). */
export async function syncSubscription(subscriptionId: string, userIdHint?: string | null): Promise<UpsertResult> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  return upsertFromStripe(sub, userIdHint)
}
