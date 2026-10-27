import 'server-only'
import type Stripe from 'stripe'
import type { SubscriptionStatus } from '@/lib/supabase/types'
import { BILLING_LIVE } from './config'
import { billingDb, SUBSCRIPTION_COLUMNS, type SubscriptionRecord } from './db'
import type { PlanId } from '@/components/profil/pricing'
import { dbTierFor } from './plans'
import { offerFromPrice, planFromOffer } from './prices'
import { getStripe, idOf } from './stripe'
import {
  applySubscriptionSnapshot,
  isBlockingStatus,
  isUuid,
  planOf,
  resolveUserIdWith,
  type BillingStore,
  type SubscriptionSnapshot,
  type UpsertResult,
} from './sync-core'

export { isBlockingStatus, isPremium, isUuid, planOf, type UpsertResult } from './sync-core'

/** Niveau propre d'un utilisateur : 'gratuit' | 'premium' | 'coparentalite'. */
export type UserPlan = PlanId

const toIso = (unix: number | null | undefined): string | null =>
  typeof unix === 'number' && unix > 0 ? new Date(unix * 1000).toISOString() : null

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

/**
 * Niveau propre d'un utilisateur (son abonnement), hors accès partagé.
 * Pour les droits, utiliser getEffectivePlan (lib/billing/entitlements.ts).
 * Hors facturation réelle : toujours 'gratuit'.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  return planOf(await getSubscription(userId))
}

// --- Stockage Supabase (service_role) ---------------------------------------

const supabaseStore: BillingStore = {
  async userIdForCustomer(customerId) {
    const { data, error } = await billingDb()
      .from('billing_customers')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (error) throw new Error(`billing_customers read failed: ${error.code ?? 'unknown'}`)
    return (data as { user_id: string } | null)?.user_id ?? null
  },
  async getByUser(userId) {
    const { data, error } = await billingDb()
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`subscriptions read failed: ${error.code ?? 'unknown'}`)
    return (data as SubscriptionRecord | null) ?? null
  },
  async apply(row, tier, observedAt) {
    const { data, error } = await billingDb().rpc('billing_apply_subscription', { p_row: row, p_tier: tier, p_observed_at: observedAt })
    if (error) throw new Error(`billing_apply_subscription failed: ${error.code ?? 'unknown'}`)
    const res = data as { outcome: string; record?: SubscriptionRecord; previous?: SubscriptionRecord | null }
    if (res.outcome === 'ok' && res.record) return { outcome: 'ok', record: res.record, previous: res.previous ?? null }
    if (res.outcome === 'outdated' || res.outcome === 'stale' || res.outcome === 'unknown_user') return { outcome: res.outcome }
    throw new Error('billing_apply_subscription: réponse inattendue')
  },
  async linkCustomer(userId, customerId) {
    const { error } = await billingDb()
      .from('billing_customers')
      .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id', ignoreDuplicates: true })
    // 23505 : ce customer est déjà lié (à ce user ou, anomalie, à un autre) : on n'écrase rien.
    if (error && error.code !== '23505') throw new Error(`billing_customers write failed: ${error.code ?? 'unknown'}`)
  },
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
  await supabaseStore.linkCustomer(user.id, customer.id)
  // Relecture : en cas de course, c'est la ligne en base qui fait foi.
  return (await getCustomerId(user.id)) ?? customer.id
}

// --- Synchronisation depuis Stripe ----------------------------------------

/** Résout l'utilisateur applicatif d'un objet Stripe, sans jamais se fier à l'e-mail. */
export function resolveUserId(metadataUserId: string | null | undefined, customerId: string | null, hint?: string | null) {
  return resolveUserIdWith(supabaseStore, metadataUserId, customerId, hint)
}

/** Instantané minimal d'un objet Stripe.Subscription (exporté pour les tests d'intégration). */
export function snapshotOf(sub: Stripe.Subscription): SubscriptionSnapshot {
  return {
    id: sub.id,
    customerId: idOf(sub.customer),
    status: sub.status as SubscriptionStatus,
    plan: planOrNull(offerFromPrice(sub.items.data[0]?.price)),
    metadataUserId: sub.metadata?.user_id ?? null,
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: toIso(sub.canceled_at),
    trial_end: toIso(sub.trial_end),
    observedAt: new Date().toISOString(),
  }
}

const planOrNull = (offer: ReturnType<typeof offerFromPrice>) => (offer ? planFromOffer(offer) : null)

/** L'abonnement est-il toujours en cours chez Stripe ? (détection de doublon) */
async function stillBlocking(subscriptionId: string): Promise<boolean> {
  try {
    const s = await getStripe().subscriptions.retrieve(subscriptionId)
    return isBlockingStatus(s.status as SubscriptionStatus)
  } catch (err) {
    const e = err as { code?: string } | null
    return e?.code !== 'resource_missing'
  }
}

/**
 * Second abonnement en cours pour un même compte (double Checkout) : résilié tout de
 * suite et dernière facture remboursée. Idempotent (clés d'idempotence par abonnement).
 */
async function cancelDuplicate(duplicateId: string): Promise<void> {
  const stripe = getStripe()
  const dup = await stripe.subscriptions.retrieve(duplicateId, { expand: ['latest_invoice'] })
  if (isBlockingStatus(dup.status as SubscriptionStatus)) {
    await stripe.subscriptions.cancel(duplicateId, { prorate: false, invoice_now: false }, { idempotencyKey: `dup-cancel:${duplicateId}` })
  }
  const invoice = typeof dup.latest_invoice === 'object' ? dup.latest_invoice : null
  const pi = idOf(invoice?.payment_intent as string | { id: string } | null | undefined)
  if (invoice && invoice.status === 'paid' && invoice.amount_paid > 0 && pi) {
    await stripe.refunds.create({ payment_intent: pi, reason: 'duplicate' }, { idempotencyKey: `dup-refund:${duplicateId}` })
  }
  console.error('[billing] ALERTE abonnement en double résilié et remboursé', { duplicate: duplicateId })
}

/**
 * Reflète un abonnement Stripe dans public.subscriptions et public.users.plan.
 * Idempotent (voir applySubscriptionSnapshot). L'appelant doit passer un objet
 * fraîchement relu chez Stripe pour ne pas dépendre de l'ordre des webhooks.
 */
export async function upsertFromStripe(sub: Stripe.Subscription, userIdHint?: string | null): Promise<UpsertResult> {
  const res = await applySubscriptionSnapshot(supabaseStore, snapshotOf(sub), userIdHint, { stillBlocking })
  if (!res.ok && res.reason === 'duplicate') await cancelDuplicate(res.duplicateId)
  return res
}

/** Relit l'abonnement chez Stripe puis le reflète (source de vérité = Stripe). */
export async function syncSubscription(subscriptionId: string, userIdHint?: string | null): Promise<UpsertResult> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  return upsertFromStripe(sub, userIdHint)
}

// --- Délai de grâce (tâche quotidienne) -------------------------------------

export type GraceReport = { checked: number; synced: number; downgraded: number; errors: number }

/**
 * Applique le délai de grâce dans le temps (users.plan ne change sinon qu'à un webhook) :
 * chaque abonnement past_due / unpaid, ou actif dont la période est dépassée de plus
 * de 2 jours (webhook manqué), est relu chez Stripe et resynchronisé. Stripe
 * injoignable : la règle de grâce est appliquée sur la ligne locale (planOf).
 * Appelé par GET /api/stripe/cron (Vercel Cron, quotidien).
 */
export async function enforceBillingGrace(now = new Date()): Promise<GraceReport> {
  const report: GraceReport = { checked: 0, synced: 0, downgraded: 0, errors: 0 }
  if (!BILLING_LIVE) return report
  const overdue = new Date(now.getTime() - 2 * 86_400_000).toISOString()
  const { data, error } = await billingDb()
    .from('subscriptions')
    .select(`${SUBSCRIPTION_COLUMNS}, synced_at`)
    .or(`status.in.(past_due,unpaid),and(status.in.(active,trialing),current_period_end.lt.${overdue})`)
    .limit(500)
  if (error) throw new Error(`subscriptions read failed: ${error.code ?? 'unknown'}`)

  for (const row of (data ?? []) as (SubscriptionRecord & { synced_at: string | null })[]) {
    report.checked++
    try {
      const res = await syncSubscription(row.stripe_subscription_id, row.user_id)
      if (res.ok) report.synced++
      if (res.ok && planOf(res.record, now) === 'gratuit' && planOf(row, now) !== 'gratuit') report.downgraded++
    } catch {
      try {
        const { id: _id, synced_at, ...rest } = row
        const tier = dbTierFor(planOf(row, now))
        const res = await supabaseStore.apply(rest, tier, synced_at ?? now.toISOString())
        if (res.outcome === 'ok' && tier === 'free') report.downgraded++
      } catch {
        report.errors++
      }
    }
  }
  return report
}
