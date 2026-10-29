/** Abonnement : libellés de statut, bouton par formule, règles de changement, synchronisation idempotente, retour Checkout, limites. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BillingView } from '../lib/billing/types'
import {
  ALL_AVAILABLE,
  NONE_AVAILABLE,
  changeImpact,
  changeImpactText,
  describeStatus,
  paywallReason,
  planAction,
  planChangeLabel,
} from '../lib/billing/ui-state'
import {
  applySubscriptionSnapshot,
  isPremium,
  planOf,
  type BillingStore,
  type SubscriptionRecord,
  type SubscriptionRow,
  type SubscriptionSnapshot,
} from '../lib/billing/sync-core'
import { checkoutSessionOwnedBy, parseCheckoutSessionId, resolveCheckoutReturn, type CheckoutSessionLike } from '../lib/billing/checkout-core'
import { applyDemoAction, demoBillingView, demoDefault, parseDemoBilling, serializeDemoBilling } from '../lib/billing/demo-core'
import { HANDLED_STRIPE_EVENTS, STRIPE_API_VERSION, invoiceSubscriptionId, isHandledStripeEvent } from '../lib/billing/events'
import { changePlanCore, parseRequestId, type ChangeDeps } from '../lib/billing/change-core'
import { claimEventWith, STALE_CLAIM_MS, type EventStore } from '../lib/billing/claim-core'
import { BILLING_RATE_LIMITS, STATUS_POLL_INTERVAL_MS, STATUS_POLL_TIMEOUT_MS } from '../lib/billing/limits'
import { MemoryLimiter } from '../lib/data/server/rate-limit-core'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

const free: BillingView = {
  live: true, plan: 'gratuit', status: null, formule: 'premium', cycle: 'mensuel', amount: null,
  periodEnd: null, cancelAtPeriodEnd: false, trialEnd: null, payUrl: null, card: null, pending: null, sharedPremium: false,
}
const premium: BillingView = {
  ...free, plan: 'premium', status: 'active', amount: 11.99, periodEnd: '2026-11-15T15:00:00.000Z', card: { brand: 'visa', last4: '4242' },
}
const noDash = (s: string) => assert.ok(!s.includes('—'), `tiret cadratin interdit : ${s}`)

// --- Statut -------------------------------------------------------------------

test('statut : Gratuit, Actif, Essai, Paiement en échec, Résiliation programmée le …', () => {
  assert.equal(describeStatus(free).label, 'Gratuit')
  const active = describeStatus(premium)
  assert.equal(active.label, 'Actif')
  assert.equal(active.dateLabel, 'Prochaine échéance')
  assert.match(active.detail, /11,99/)
  assert.equal(describeStatus({ ...premium, status: 'trialing', trialEnd: '2026-11-01T15:00:00Z' }).label, 'Essai')

  const failed = describeStatus({ ...premium, status: 'past_due' })
  assert.equal(failed.label, 'Paiement en échec')
  assert.equal(failed.action, 'fix_payment')
  assert.equal(describeStatus({ ...premium, status: 'unpaid' }).action, 'fix_payment')

  const canceling = describeStatus({ ...premium, cancelAtPeriodEnd: true })
  assert.equal(canceling.label, 'Résiliation programmée le 15 novembre 2026')
  assert.equal(canceling.action, 'resume')
  assert.equal(canceling.dateLabel, 'Fin d’accès')

  assert.equal(describeStatus({ ...free, status: 'canceled' }).headline, 'Votre abonnement a pris fin')
  assert.equal(describeStatus({ ...free, sharedPremium: true }).label, 'Premium offert')
  for (const v of [free, premium, { ...premium, status: 'past_due' as const }, { ...premium, cancelAtPeriodEnd: true }]) {
    const s = describeStatus(v)
    noDash(s.label); noDash(s.headline); noDash(s.detail)
  }
})

// --- Bouton par formule ----------------------------------------------------------

const action = (view: BillingView, target: 'gratuit' | 'premium' | 'coparentalite', cycle: 'mensuel' | 'annuel' = 'mensuel', mode: 'live' | 'demo' | 'unavailable' = 'live') =>
  planAction({ mode, view, target, cycle, available: mode === 'unavailable' ? NONE_AVAILABLE : ALL_AVAILABLE })

test('depuis Gratuit : « Plan actuel » désactivé et « S’abonner » sur les formules payantes', () => {
  assert.deepEqual([action(free, 'gratuit').kind, action(free, 'gratuit').disabled], ['current', true])
  assert.equal(action(free, 'premium').kind, 'subscribe')
  assert.equal(action(free, 'premium').label, 'S’abonner')
  assert.equal(action(free, 'coparentalite', 'annuel').kind, 'subscribe')
  assert.match(action(free, 'premium', 'mensuel', 'demo').hint ?? '', /Démonstration/)
})

test('sans clé Stripe : jamais de bouton cassé, « Paiement bientôt disponible »', () => {
  const a = action(free, 'premium', 'mensuel', 'unavailable')
  assert.equal(a.kind, 'unavailable')
  assert.equal(a.disabled, true)
  assert.equal(a.label, 'Paiement bientôt disponible')
  // Un seul Price manquant : seule cette formule est indisponible.
  const partial = planAction({ mode: 'live', view: free, target: 'coparentalite', cycle: 'annuel', available: { ...ALL_AVAILABLE, coparentalite: { mensuel: true, annuel: false } } })
  assert.equal(partial.kind, 'unavailable')
})

test('abonné Premium mensuel : plan actuel, passage à Coparentalité+, à l’annuel, retour à Gratuit', () => {
  assert.equal(action(premium, 'premium').kind, 'current')
  assert.equal(action(premium, 'premium').label, 'Plan actuel')
  assert.equal(action(premium, 'coparentalite').label, 'Passer à Coparentalité+')
  assert.equal(action(premium, 'premium', 'annuel').label, 'Passer à l’annuel')
  assert.equal(action(premium, 'gratuit').kind, 'cancel')
  const copa: BillingView = { ...premium, plan: 'coparentalite', formule: 'coparentalite' }
  assert.equal(action(copa, 'premium').label, 'Revenir à Premium')
})

test('résiliation programmée : reprise sur la formule actuelle, changements verrouillés', () => {
  const v = { ...premium, cancelAtPeriodEnd: true }
  assert.equal(action(v, 'premium').kind, 'resume')
  assert.equal(action(v, 'premium').label, 'Reprendre l’abonnement')
  assert.equal(action(v, 'coparentalite').kind, 'locked')
  assert.equal(action(v, 'coparentalite').disabled, true)
  assert.equal(action(v, 'gratuit').kind, 'scheduled')
})

test('paiement en échec : mise à jour du paiement, aucun changement possible', () => {
  const v = { ...premium, status: 'past_due' as const }
  assert.equal(action(v, 'premium').kind, 'fix_payment')
  assert.equal(action(v, 'coparentalite').kind, 'locked')
})

test('changement programmé : « Garder cette formule » et cible marquée « Prévu le … »', () => {
  const v: BillingView = { ...premium, pending: { plan: 'premium', cycle: 'annuel' } }
  assert.equal(action(v, 'premium').kind, 'keep')
  assert.equal(action(v, 'premium', 'annuel').kind, 'scheduled')
  assert.equal(action(v, 'premium', 'annuel').disabled, true)
})

test('règles de changement (miroir de changePlan côté serveur) et texte du prorata', () => {
  const cur = { plan: 'premium', cycle: 'mensuel' } as const
  assert.equal(changeImpact(cur, null, { plan: 'coparentalite', cycle: 'mensuel' }), 'upgrade')
  // Cahier V6 : la descente de niveau est programmée à l'échéance (jamais immédiate).
  assert.equal(changeImpact({ plan: 'coparentalite', cycle: 'annuel' }, null, { plan: 'premium', cycle: 'annuel' }), 'scheduled')
  assert.equal(changeImpact(cur, null, { plan: 'premium', cycle: 'annuel' }), 'scheduled')
  assert.equal(changeImpact(cur, null, cur), 'none')
  assert.equal(changeImpact(cur, { plan: 'premium', cycle: 'annuel' }, cur), 'cancel_pending')
  assert.equal(planChangeLabel(cur, { plan: 'premium', cycle: 'mensuel' }), 'Passer au mensuel')
  const up = changeImpactText('upgrade', cur, { plan: 'coparentalite', cycle: 'mensuel' }, null)
  assert.match(up, /prorata/)
  assert.match(up, /24,99/)
  assert.match(changeImpactText('scheduled', cur, { plan: 'premium', cycle: 'annuel' }, '2026-11-15T15:00:00Z'), /15 novembre 2026, sans frais/)
  for (const i of ['none', 'cancel_pending', 'scheduled', 'upgrade', 'downgrade'] as const) noDash(changeImpactText(i, cur, { plan: 'coparentalite', cycle: 'annuel' }, null))
})

test('raisons de paywall : liste blanche', () => {
  assert.equal(paywallReason('coach')?.formule, 'premium')
  assert.equal(paywallReason('partage')?.formule, 'coparentalite')
  assert.equal(paywallReason('__proto__'), null)
  assert.equal(paywallReason('<script>'), null)
})

// --- Synchronisation idempotente --------------------------------------------------

function memoryStore(seed: { customers?: Record<string, string>; users?: Record<string, string> } = {}) {
  const customers = new Map(Object.entries(seed.customers ?? {})) // customer → user
  const subs = new Map<string, SubscriptionRecord & { synced_at: string }>()
  const tiers = new Map(Object.entries(seed.users ?? {}))
  const writes = { applies: 0 }
  // Même sémantique que public.billing_apply_subscription (0460, testée en SQL).
  const store: BillingStore = {
    async userIdForCustomer(c) { return customers.get(c) ?? null },
    async getByUser(u) { return subs.get(u) ?? null },
    async apply(row: SubscriptionRow, tier, observedAt) {
      const prev = subs.get(row.user_id) ?? null
      if (prev && prev.stripe_subscription_id === row.stripe_subscription_id && prev.synced_at > observedAt) return { outcome: 'outdated' }
      if (!tiers.has(row.user_id)) return { outcome: 'unknown_user' }
      writes.applies++
      const rec = { id: prev?.id ?? `sub-row-${row.user_id}`, ...row, synced_at: observedAt }
      subs.set(row.user_id, rec)
      if (tiers.get(row.user_id) !== 'admin') tiers.set(row.user_id, tier)
      return { outcome: 'ok', record: rec, previous: prev }
    },
    async linkCustomer(u, c) { if (![...customers.values()].includes(u) && !customers.has(c)) customers.set(c, u) },
  }
  return { store, subs, tiers, customers, writes }
}

const snap = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  id: 'sub_A', customerId: 'cus_1', status: 'active', plan: 'premium_monthly', metadataUserId: U1,
  current_period_start: '2026-10-01T00:00:00.000Z', current_period_end: '2026-11-01T00:00:00.000Z',
  cancel_at_period_end: false, canceled_at: null, trial_end: null, observedAt: '2026-10-27T10:00:00.000Z', ...over,
})

test('sync : écrit l’abonnement ET users.plan ; rejouer est sans effet (idempotent)', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  const r1 = await applySubscriptionSnapshot(m.store, snap())
  assert.ok(r1.ok)
  assert.equal(m.tiers.get(U1), 'premium')
  assert.equal(m.customers.get('cus_1'), U1)
  const before = JSON.stringify(m.subs.get(U1))
  const r2 = await applySubscriptionSnapshot(m.store, snap())
  assert.ok(r2.ok)
  assert.equal(JSON.stringify(m.subs.get(U1)), before)
  assert.equal(m.tiers.get(U1), 'premium')
  assert.equal(m.subs.size, 1)
})

test('sync : montée en Coparentalité+, résiliation puis suppression ramènent users.plan', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  await applySubscriptionSnapshot(m.store, snap({ plan: 'coparentalite_yearly' }))
  assert.equal(m.tiers.get(U1), 'coparentalite')
  await applySubscriptionSnapshot(m.store, snap({ plan: 'coparentalite_yearly', cancel_at_period_end: true }))
  assert.equal(m.tiers.get(U1), 'coparentalite') // accès conservé jusqu'à la fin de période
  await applySubscriptionSnapshot(m.store, snap({ status: 'canceled' }))
  assert.equal(m.tiers.get(U1), 'free')
})

test('sync : un ancien abonnement terminé n’écrase pas l’abonnement en cours', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  await applySubscriptionSnapshot(m.store, snap({ id: 'sub_NEW' }))
  const stale = await applySubscriptionSnapshot(m.store, snap({ id: 'sub_OLD', status: 'canceled', observedAt: '2026-10-28T00:00:00.000Z' }))
  assert.deepEqual(stale, { ok: false, reason: 'stale' })
  assert.equal(m.subs.get(U1)?.stripe_subscription_id, 'sub_NEW')
  assert.equal(m.tiers.get(U1), 'premium')
})

test('sync : le customer déjà lié fait foi (jamais les métadonnées d’un autre compte)', async () => {
  const m = memoryStore({ customers: { cus_1: U1 }, users: { [U1]: 'free', [U2]: 'free' } })
  const r = await applySubscriptionSnapshot(m.store, snap({ metadataUserId: U2 }), U2)
  assert.ok(r.ok && r.userId === U1)
  assert.equal(m.tiers.get(U2), 'free')
  const unknown = await applySubscriptionSnapshot(memoryStore().store, snap({ metadataUserId: null }))
  assert.deepEqual(unknown, { ok: false, reason: 'unknown_user' })
})

test('sync : un administrateur reste administrateur', async () => {
  const m = memoryStore({ users: { [U1]: 'admin' } })
  await applySubscriptionSnapshot(m.store, snap())
  assert.equal(m.tiers.get(U1), 'admin')
})

test('accès : past_due conservé pendant la grâce, puis Gratuit', () => {
  const now = new Date('2026-10-10T00:00:00Z')
  const rec = { status: 'past_due' as const, current_period_start: '2026-10-01T00:00:00Z', plan: 'premium_monthly' as const }
  assert.equal(isPremium(rec, now, 14), true)
  assert.equal(isPremium(rec, new Date('2026-10-20T00:00:00Z'), 14), false)
  assert.equal(planOf({ ...rec, status: 'unpaid' }, now), 'gratuit')
})

// --- Retour de Checkout ----------------------------------------------------------

const session = (over: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike => ({
  id: 'cs_test_abcdefghijkl', mode: 'subscription', status: 'complete', payment_status: 'paid',
  client_reference_id: U1, customer: 'cus_1', subscription: 'sub_A', ...over,
})

function checkoutDeps(s: CheckoutSessionLike | null, opts: { customer?: string | null } = {}) {
  const m = memoryStore({ users: { [U1]: 'free', [U2]: 'free' } })
  let syncs = 0
  return {
    m,
    get syncs() { return syncs },
    deps: {
      retrieveSession: async () => s,
      getCustomerId: async () => (opts.customer === undefined ? 'cus_1' : opts.customer),
      getLocal: (u: string) => m.store.getByUser(u),
      syncSubscription: async (id: string, hint: string) => { syncs++; return applySubscriptionSnapshot(m.store, snap({ id }), hint) },
    },
  }
}

test('Checkout : identifiant de session strictement validé', () => {
  assert.equal(parseCheckoutSessionId('cs_test_abcdefghijkl'), 'cs_test_abcdefghijkl')
  assert.equal(parseCheckoutSessionId('cs_live_ABCDEFGHIJ12'), 'cs_live_ABCDEFGHIJ12')
  for (const bad of ['', 'sub_123', 'cs_test_short', 'cs_test_abc/../x', 'cs_test_abcdefghijkl&x=1', null, 42]) {
    assert.equal(parseCheckoutSessionId(bad), null)
  }
})

test('Checkout : impossible de lire ou synchroniser la session d’un autre compte', async () => {
  assert.equal(checkoutSessionOwnedBy(session(), U2, null), false)
  assert.equal(checkoutSessionOwnedBy(session({ customer: 'cus_OTHER' }), U1, 'cus_1'), false)
  assert.equal(checkoutSessionOwnedBy(session(), U1, 'cus_1'), true)

  const other = checkoutDeps(session({ client_reference_id: U2 }))
  assert.deepEqual(await resolveCheckoutReturn(other.deps, U1, 'cs_test_abcdefghijkl'), { state: 'not_found' })
  assert.equal(other.syncs, 0)
  assert.equal(other.m.subs.size, 0)

  const wrongCustomer = checkoutDeps(session(), { customer: 'cus_ZZZ' })
  assert.deepEqual(await resolveCheckoutReturn(wrongCustomer.deps, U1, 'cs_test_abcdefghijkl'), { state: 'not_found' })
  assert.equal(wrongCustomer.syncs, 0)

  const missing = checkoutDeps(null)
  assert.deepEqual(await resolveCheckoutReturn(missing.deps, U1, 'cs_test_abcdefghijkl'), { state: 'not_found' })
  assert.deepEqual(await resolveCheckoutReturn(missing.deps, U1, 'nimporte'), { state: 'not_found' })
})

test('Checkout : session payée → abonnement synchronisé tout de suite, puis plus d’appel Stripe', async () => {
  const c = checkoutDeps(session())
  assert.deepEqual(await resolveCheckoutReturn(c.deps, U1, 'cs_test_abcdefghijkl'), { state: 'active', plan: 'premium' })
  assert.equal(c.m.tiers.get(U1), 'premium')
  assert.equal(c.syncs, 1)
  // Interrogation suivante (ou webhook déjà passé) : idempotent, pas de nouvelle synchronisation.
  assert.deepEqual(await resolveCheckoutReturn(c.deps, U1, 'cs_test_abcdefghijkl'), { state: 'active', plan: 'premium' })
  assert.equal(c.syncs, 1)
})

test('Checkout : session ouverte, expirée ou paiement pas encore abouti', async () => {
  assert.deepEqual(await resolveCheckoutReturn(checkoutDeps(session({ status: 'open' })).deps, U1, 'cs_test_abcdefghijkl'), { state: 'open' })
  assert.deepEqual(await resolveCheckoutReturn(checkoutDeps(session({ status: 'expired' })).deps, U1, 'cs_test_abcdefghijkl'), { state: 'expired' })
  assert.deepEqual(await resolveCheckoutReturn(checkoutDeps(session({ subscription: null })).deps, U1, 'cs_test_abcdefghijkl'), { state: 'pending' })
  const incomplete = checkoutDeps(session())
  incomplete.deps.syncSubscription = async (id, hint) => applySubscriptionSnapshot(incomplete.m.store, snap({ id, status: 'incomplete' }), hint)
  assert.deepEqual(await resolveCheckoutReturn(incomplete.deps, U1, 'cs_test_abcdefghijkl'), { state: 'pending' })
})

// --- Webhook, limites, démonstration --------------------------------------------------

test('webhook : exactement les huit événements traités', () => {
  assert.deepEqual([...HANDLED_STRIPE_EVENTS].sort(), [
    'charge.dispute.created', 'charge.refunded', 'checkout.session.completed', 'customer.subscription.created', 'customer.subscription.deleted',
    'customer.subscription.updated', 'invoice.paid', 'invoice.payment_failed',
  ])
  assert.equal(isHandledStripeEvent('invoice.upcoming'), false)
})

test('limites : l’interrogation de confirmation tient dans la limite, le martèlement est refusé', () => {
  const polls = Math.ceil(STATUS_POLL_TIMEOUT_MS / STATUS_POLL_INTERVAL_MS) + 1
  const { limit, windowMs } = BILLING_RATE_LIMITS.status
  assert.ok(polls <= limit, `${polls} interrogations > ${limit}`)
  const rl = new MemoryLimiter()
  const now = 1_000_000
  for (let i = 0; i < limit; i++) assert.equal(rl.hit('billing:status:u:x', limit, windowMs, now + i).ok, true)
  const over = rl.hit('billing:status:u:x', limit, windowMs, now + limit)
  assert.equal(over.ok, false)
  // Un autre utilisateur n'est pas affecté.
  assert.equal(rl.hit('billing:status:u:y', limit, windowMs, now).ok, true)
  assert.ok(BILLING_RATE_LIMITS.checkout.limit <= 10)
})

test('démonstration : parcours simulé S’abonner → changer → résilier → reprendre', () => {
  const now = Date.parse('2026-10-27T10:00:00Z')
  let s = demoDefault('parent-gratuit', now)
  assert.equal(demoBillingView(s, now).plan, 'gratuit')
  s = applyDemoAction(s, { action: 'subscribe', formule: 'premium', cycle: 'annuel' }, now)!
  const v = demoBillingView(s, now)
  assert.equal(v.status, 'active')
  assert.equal(v.live, false)
  assert.equal(new Date(v.periodEnd!).getUTCFullYear(), 2027)
  assert.equal(applyDemoAction(s, { action: 'subscribe', formule: 'premium', cycle: 'mensuel' }, now), null)
  s = applyDemoAction(s, { action: 'change', formule: 'coparentalite', cycle: 'annuel' }, now)!
  s = applyDemoAction(s, { action: 'cancel' }, now)!
  assert.equal(describeStatus(demoBillingView(s, now)).tone, 'warning')
  assert.equal(applyDemoAction(s, { action: 'change', formule: 'premium', cycle: 'annuel' }, now), null)
  s = applyDemoAction(s, { action: 'resume' }, now)!
  assert.deepEqual(parseDemoBilling(serializeDemoBilling(s)), s)
  assert.equal(parseDemoBilling('admin.annuel.0.1'), null)
  assert.equal(demoDefault('parent-premium', now).plan, 'premium')
})


// --- Revue : compléments ----------------------------------------------------------

test('sync : une lecture Stripe plus ancienne n’écrase pas une plus récente (course webhook / retour)', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  await applySubscriptionSnapshot(m.store, snap({ plan: 'coparentalite_monthly', observedAt: '2026-10-27T10:05:00.000Z' }))
  const late = await applySubscriptionSnapshot(m.store, snap({ plan: 'premium_monthly', observedAt: '2026-10-27T10:01:00.000Z' }))
  assert.deepEqual(late, { ok: false, reason: 'outdated' })
  assert.equal(m.tiers.get(U1), 'coparentalite')
})

test('sync : Price inconnu → aucun droit (refus + journal), rien écrit', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  const origErr = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await applySubscriptionSnapshot(m.store, snap({ plan: null })), { ok: false, reason: 'unknown_price' })
  } finally { console.error = origErr }
  assert.equal(m.tiers.get(U1), 'free')
  assert.equal(m.writes.applies, 0)
})

test('sync : second abonnement en cours signalé comme doublon (jamais écrit) ; ancien terminé → remplacé', async () => {
  const m = memoryStore({ users: { [U1]: 'free' } })
  await applySubscriptionSnapshot(m.store, snap({ id: 'sub_FIRST' }))
  const origErr = console.error
  console.error = () => {}
  try {
    const dup = await applySubscriptionSnapshot(m.store, snap({ id: 'sub_SECOND' }), null, { stillBlocking: async () => true })
    assert.deepEqual(dup, { ok: false, reason: 'duplicate', userId: U1, keptId: 'sub_FIRST', duplicateId: 'sub_SECOND' })
  } finally { console.error = origErr }
  assert.equal(m.subs.get(U1)?.stripe_subscription_id, 'sub_FIRST')
  // L'abonnement enregistré n'existe plus chez Stripe (webhook manqué) : le nouveau le remplace.
  const ok = await applySubscriptionSnapshot(m.store, snap({ id: 'sub_SECOND' }), null, { stillBlocking: async () => false })
  assert.ok(ok.ok)
  assert.equal(m.subs.get(U1)?.stripe_subscription_id, 'sub_SECOND')
})

test('statut : changement programmé, impayé, paiement à finaliser', () => {
  const pending = describeStatus({ ...premium, pending: { plan: 'premium', cycle: 'annuel' } })
  assert.match(pending.detail, /149,00/)
  assert.match(pending.detail, /Premium annuel/)
  assert.doesNotMatch(pending.detail, /14,99/)
  const unpaid = describeStatus({ ...premium, status: 'unpaid' })
  assert.equal(unpaid.label, 'Paiement en échec')
  assert.match(unpaid.detail, /suspendus/)
  const inc = describeStatus({ ...free, status: 'incomplete', payUrl: 'https://invoice.stripe.com/i/x' })
  assert.equal(inc.label, 'Paiement à finaliser')
  assert.equal(inc.action, 'pay')
  assert.equal(describeStatus({ ...free, status: 'incomplete' }).action, null)
  // Rien d'ouvert : les formules restent proposées.
  assert.equal(action({ ...free, status: 'incomplete' }, 'premium').kind, 'subscribe')
})

test('changement de niveau + de cycle : niveau immédiat sur le cycle actuel, cycle à l’échéance ; essai sans prélèvement', () => {
  const cur = { plan: 'premium', cycle: 'mensuel' } as const
  const t = changeImpactText('upgrade', cur, { plan: 'coparentalite', cycle: 'annuel' }, '2026-11-15T15:00:00Z')
  assert.match(t, /Coparentalité\+ mensuel/)
  assert.match(t, /annuel \(249,00\s€ \/ an\) s’appliquera ensuite le 15 novembre 2026/)
  assert.doesNotMatch(t, /puis 24,99/)
  const trial = changeImpactText('upgrade', cur, { plan: 'coparentalite', cycle: 'mensuel' }, null, { trialing: true })
  assert.match(trial, /Rien n’est prélevé aujourd’hui/)
  assert.doesNotMatch(trial, /payez aujourd’hui/)
  assert.match(action(premium, 'coparentalite', 'annuel').hint ?? '', /annuel à partir du/)
})

// --- Changement de formule : fausse API Stripe (cache d'idempotence compris) ---------

const PRICE_ID: Record<string, string> = {
  'premium:mensuel': 'price_PM', 'premium:annuel': 'price_PY', 'coparentalite:mensuel': 'price_CM', 'coparentalite:annuel': 'price_CY',
}

function fakeStripe(start = 'price_PM', opts: { failPayment?: boolean } = {}) {
  const state = { price: start, schedule: null as string | null, pendingPrice: null as string | null, invoices: 1, charges: [] as string[] }
  const idem = new Map<string, string>() // clé → Price appliqué lors du 1er appel (comme le cache Stripe)
  const db = { plan: start }
  const deps: ChangeDeps = {
    priceIdForOffer: o => PRICE_ID[`${o.plan}:${o.cycle}`] ?? null,
    offerFromPriceId: id => {
      const k = Object.keys(PRICE_ID).find(x => PRICE_ID[x] === id)
      return k ? { plan: k.split(':')[0] as 'premium', cycle: k.split(':')[1] as 'mensuel' } : null
    },
    retrieve: async () => ({
      id: 'sub_1', status: 'active', cancel_at_period_end: false, current_period_end: 1_800_000_000,
      schedule: state.schedule, latest_invoice: `in_${state.invoices}`, item: { id: 'si_1', price: state.price },
    }),
    updatePrice: async (_sub, price, proration, key) => {
      if (idem.has(key)) return // Stripe rejoue la réponse en cache : RIEN n'est appliqué
      if (opts.failPayment && proration === 'always_invoice') throw Object.assign(new Error('card_declined'), { type: 'StripeCardError' })
      idem.set(key, price)
      state.price = price
      if (proration === 'always_invoice') { state.charges.push(price); state.invoices++ }
    },
    releaseSchedule: async () => { state.schedule = null; state.pendingPrice = null },
    scheduleNext: async (_s, _cur, next) => { state.schedule = 'sub_sched_1'; state.pendingPrice = next },
    sync: async () => { db.plan = state.price; return { ok: false, reason: 'unknown_user' } as const },
  }
  return { deps, state, db }
}

test('changePlan (T13/T14) : montée immédiate payée ; descente programmée à l’échéance, sans prorata ni remboursement', async () => {
  const f = fakeStripe()
  // Montée P → C : immédiate, différence facturée tout de suite.
  const up = await changePlanCore(f.deps, 'sub_1', { plan: 'coparentalite', cycle: 'mensuel' }, crypto.randomUUID())
  assert.ok(up.ok && up.status === 'upgraded', JSON.stringify(up))
  assert.equal(f.state.price, 'price_CM')
  assert.equal(f.db.plan, 'price_CM')
  assert.deepEqual(f.state.charges, ['price_CM'])
  // Descente C → P : rien ne change avant l'échéance (formule actuelle conservée), aucun crédit au prorata.
  const down = await changePlanCore(f.deps, 'sub_1', { plan: 'premium', cycle: 'mensuel' }, crypto.randomUUID())
  assert.ok(down.ok && down.status === 'scheduled' && down.effective_at === new Date(1_800_000_000 * 1000).toISOString(), JSON.stringify(down))
  assert.equal(f.state.price, 'price_CM', 'droits actuels conservés jusqu’à l’échéance')
  assert.equal(f.state.pendingPrice, 'price_PM')
  assert.deepEqual(f.state.charges, ['price_CM'])
  // Choisir à nouveau la formule actuelle annule la descente programmée.
  const keep = await changePlanCore(f.deps, 'sub_1', { plan: 'coparentalite', cycle: 'mensuel' }, crypto.randomUUID())
  assert.ok(keep.ok && keep.status === 'pending_change_canceled')
  assert.equal(f.state.pendingPrice, null)
})

test('changePlan : double clic (même request_id) dédupliqué ; réponse en cache détectée, rien écrit de faux', async () => {
  const f = fakeStripe()
  const id = crypto.randomUUID()
  assert.ok((await changePlanCore(f.deps, 'sub_1', { plan: 'coparentalite', cycle: 'mensuel' }, id)).ok)
  assert.deepEqual(f.state.charges, ['price_CM'])
  // Forcer un rejeu : même clé (même facture, même requestId) alors que Stripe est revenu à Premium.
  f.state.price = 'price_PM'
  f.state.invoices-- // même latest_invoice qu'au premier appel
  const replay = await changePlanCore(f.deps, 'sub_1', { plan: 'coparentalite', cycle: 'mensuel' }, id)
  assert.equal(replay.ok, false)
  assert.equal(!replay.ok && replay.code, 'change_not_applied')
  assert.equal(f.db.plan, 'price_PM') // la base reflète Stripe, pas l'objet renvoyé
  assert.deepEqual(f.state.charges, ['price_CM'])
})

test('changePlan : niveau + cycle → niveau immédiat sur le cycle actuel, cycle programmé', async () => {
  const f = fakeStripe()
  const r = await changePlanCore(f.deps, 'sub_1', { plan: 'coparentalite', cycle: 'annuel' }, crypto.randomUUID())
  assert.ok(r.ok && r.status === 'upgraded')
  assert.deepEqual(r.ok && r.pending, { plan: 'coparentalite', cycle: 'annuel' })
  assert.equal(f.state.price, 'price_CM')
  assert.equal(f.state.pendingPrice, 'price_CY')
})

test('changePlan : cycle seul programmé, re-choisir l’actuel annule, paiement refusé → 402 sans changement', async () => {
  const f = fakeStripe()
  let r = await changePlanCore(f.deps, 'sub_1', { plan: 'premium', cycle: 'annuel' }, crypto.randomUUID())
  assert.ok(r.ok && r.status === 'scheduled')
  assert.equal(f.state.price, 'price_PM')
  r = await changePlanCore(f.deps, 'sub_1', { plan: 'premium', cycle: 'mensuel' }, crypto.randomUUID())
  assert.ok(r.ok && r.status === 'pending_change_canceled')
  assert.equal(f.state.schedule, null)

  const g = fakeStripe('price_PM', { failPayment: true })
  const fail = await changePlanCore(g.deps, 'sub_1', { plan: 'coparentalite', cycle: 'mensuel' }, crypto.randomUUID())
  assert.equal(!fail.ok && fail.status, 402)
  assert.equal(g.state.price, 'price_PM')
  assert.equal(parseRequestId('not-a-uuid'), null)
  assert.ok(parseRequestId(crypto.randomUUID()))
})

// --- Webhook : forme des factures et idempotence --------------------------------------

test('facture : abonnement lu en forme acacia ET basil', () => {
  assert.equal(invoiceSubscriptionId({ id: 'in_1', subscription: 'sub_acacia' }), 'sub_acacia')
  assert.equal(invoiceSubscriptionId({ id: 'in_1', subscription: { id: 'sub_obj' } }), 'sub_obj')
  const basil = {
    id: 'in_2', object: 'invoice',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_basil', metadata: {} } },
    lines: { data: [{ parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub_basil' } } }] },
  }
  assert.equal(invoiceSubscriptionId(basil), 'sub_basil')
  assert.equal(invoiceSubscriptionId({ id: 'in_3', lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_line' } } }] } }), 'sub_line')
  assert.equal(invoiceSubscriptionId({ id: 'in_4' }), null)
  assert.equal(STRIPE_API_VERSION, '2025-02-24.acacia')
})

function eventStore() {
  const rows = new Map<string, { processed_at: string | null; received_at: string }>()
  const store: EventStore = {
    async insert(id) { if (rows.has(id)) return 'duplicate'; rows.set(id, { processed_at: null, received_at: new Date(T0).toISOString() }); return 'ok' },
    async get(id) { return rows.get(id) ?? null },
    async takeOver(id, expected, nowIso) {
      const r = rows.get(id)
      if (!r || r.processed_at || r.received_at !== expected) return false
      r.received_at = nowIso
      return true
    },
  }
  return { store, rows }
}
const T0 = Date.parse('2026-10-27T10:00:00Z')

test('webhook : idempotence par identifiant d’événement (claimEvent)', async () => {
  const e = eventStore()
  const ev = { id: 'evt_1', type: 'invoice.paid' }
  assert.equal(await claimEventWith(e.store, ev, T0), 'claimed')
  assert.equal(await claimEventWith(e.store, ev, T0 + 1000), 'in_flight') // livraison parallèle
  e.rows.get('evt_1')!.processed_at = new Date(T0 + 2000).toISOString()
  assert.equal(await claimEventWith(e.store, ev, T0 + 3000), 'done') // relivraison après traitement
  // Réclamation abandonnée (crash) : reprise après STALE_CLAIM_MS, une seule fois.
  const e2 = eventStore()
  const ev2 = { id: 'evt_2', type: 'invoice.paid' }
  await claimEventWith(e2.store, ev2, T0)
  assert.equal(await claimEventWith(e2.store, ev2, T0 + STALE_CLAIM_MS + 1), 'claimed')
  assert.equal(await claimEventWith(e2.store, ev2, T0 + STALE_CLAIM_MS + 2), 'in_flight')
})
