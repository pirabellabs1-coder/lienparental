/**
 * Portefeuille de crédits IA (cahier V6) : logique pure (lib/ai/wallet-core.ts, miroir de 0520),
 * catalogue versionné (lib/ai/credit-config.ts), garde-fous de coût, scénarios de recette
 * T01-T06 et T11-T17. La base (verrou, FOR UPDATE, RLS, journal immuable, triggers familiaux) est
 * couverte par tests/sql/scenarios/0520-credits-v6.test.mjs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONFIRM_COST_THRESHOLD,
  DEFAULT_CREDIT_CONFIG,
  actionForKind,
  activePacks,
  creditConfigSchema,
  documentRefusal,
  estimateCostEur,
  needsConfirmation,
  parseCreditConfig,
  pdfPageCount,
  type CreditConfig,
} from '../lib/ai/credit-config'
import {
  MemoryWallet,
  RESERVATION_MARGIN_MS,
  addMonthsUtc,
  creditPeriod,
  monthsElapsed,
  parseIdempotencyKey,
  splitDebit,
  usableLotsV6,
} from '../lib/ai/wallet-core'
import { creditGrantFromSession, grantCreditsFromSession, memoryCreditStore, type CreditSessionLike } from '../lib/ai/credits-core'
import { AI_CREDITS_KIND } from '../lib/billing/credit-packs'
import { resolveEffectivePlan } from '../lib/billing/plans'
import { changeImpact } from '../lib/billing/ui-state'
import { computeMrr } from '../lib/admin/ops/credits-core'

const ROOT = process.cwd()
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const DAY = 86_400_000
const A = '11111111-2222-4333-8444-555555555555'
const B = '99999999-2222-4333-8444-555555555555'
const NOW = Date.parse('2026-10-29T12:00:00Z')
let seq = 0
const key = () => `k_test_${(++seq).toString().padStart(12, '0')}`
const cfg = (): CreditConfig => structuredClone(DEFAULT_CREDIT_CONFIG)

function wallet(over: Partial<CreditConfig> = {}) {
  let n = 0
  const w = new MemoryWallet({ ...cfg(), ...over }, () => `id-${++n}`)
  w.setUser(A, { plan: 'gratuit', signupAt: '2026-10-19T12:00:00Z', subscription: null })
  w.setUser(B, { plan: 'gratuit', signupAt: '2026-10-01T00:00:00Z', subscription: null })
  return w
}
const buy = (w: MemoryWallet, user: string, credits: number, at = NOW, pi: string | null = null) =>
  w.grant(user, { sessionId: `cs_test_${user.slice(0, 4)}${at}${credits}`, credits, paymentIntent: pi, purchasedAt: new Date(at).toISOString() }, at)

// --- Catalogue -------------------------------------------------------------------------------

test('catalogue V6 : coûts 1 / 2 / 3, courrier et dossier au catalogue mais inactifs, validité 24 mois', () => {
  const c = DEFAULT_CREDIT_CONFIG
  assert.deepEqual(c.monthlyCredits, { gratuit: 5, premium: 60, coparentalite: 200 })
  assert.equal(c.actions.chat_question.cost, 1)
  assert.equal(c.actions.situation_analysis.cost, 2)
  assert.equal(c.actions.document_analysis.cost, 3)
  assert.equal(c.actions.custom_letter.cost, 3)
  assert.equal(c.actions.full_dossier.cost, 5)
  assert.equal(c.actions.custom_letter.active, false)
  assert.equal(c.actions.full_dossier.active, false)
  assert.equal(c.purchasedValidityMonths, 24)
  assert.deepEqual(activePacks(c).map((p) => [p.credits, p.priceCents]), [[10, 249], [30, 599], [75, 1199], [150, 1999]])
  assert.equal(actionForKind('message'), 'situation_analysis')
  assert.equal(actionForKind('capture'), 'situation_analysis')
  for (const k of ['pdf', 'word', 'document'] as const) assert.equal(actionForKind(k), 'document_analysis')
  // Confirmation explicite à partir de 3 crédits.
  assert.equal(CONFIRM_COST_THRESHOLD, 3)
  assert.equal(needsConfirmation(2), false)
  assert.equal(needsConfirmation(3), true)
})

test('catalogue : la version 1 de la migration = valeurs par défaut du code ; validation stricte', () => {
  const sql = read('supabase/migrations/0520_credits_v6.sql')
  const json = sql.slice(sql.indexOf('$json$') + 6, sql.lastIndexOf('$json$'))
  assert.deepEqual(parseCreditConfig(JSON.parse(json)), DEFAULT_CREDIT_CONFIG)
  assert.ok(creditConfigSchema.safeParse(DEFAULT_CREDIT_CONFIG).success)
  const bad = (mut: (c: CreditConfig) => void) => { const c = cfg(); mut(c); return parseCreditConfig(c) }
  assert.equal(bad((c) => { c.monthlyCredits.premium = -1 }), null, 'quota négatif')
  assert.equal(bad((c) => { c.actions.chat_question.cost = 1.5 }), null, 'coût non entier')
  assert.equal(bad((c) => { c.packs = c.packs.map((p) => ({ ...p, active: false })) }), null, 'aucun pack actif')
  assert.equal(bad((c) => { c.packs.push({ ...c.packs[0] }) }), null, 'identifiant en double')
  assert.equal(bad((c) => { c.purchasedValidityMonths = 0 }), null)
  assert.equal(bad((c) => { (c as unknown as Record<string, unknown>).extra = 1 }), null, 'champ inconnu')
})

test('coût fournisseur estimé : claude-opus-5-5 à 4 $ / 20 $ par million, conversion configurable', () => {
  const c = cfg()
  // 10 000 tokens en entrée, 2 000 en sortie : 0,04 + 0,04 = 0,08 $ → × 0,92 = 0,0736 €.
  assert.equal(estimateCostEur(c, 'claude-opus-5-5', { input_tokens: 10_000, output_tokens: 2_000 }), 0.0736)
  c.pricing.usdToEur = 1
  assert.equal(estimateCostEur(c, 'claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 }), 4)
  // Modèle inconnu (repli) : tarif du premier modèle, jamais 0.
  assert.equal(estimateCostEur(c, 'autre-modele', { input_tokens: 0, output_tokens: 1_000_000 }), 20)
  assert.equal(estimateCostEur(c, 'claude-opus-5-5', null), 0)
})

// --- Périodes --------------------------------------------------------------------------------

test('périodes : mois calendaires UTC bornés (miroir de PostgreSQL), Gratuit ancré sur l’inscription', () => {
  assert.equal(addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-28T10:00:00.000Z')
  assert.equal(addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 2).toISOString(), '2026-03-31T10:00:00.000Z')
  assert.equal(monthsElapsed(new Date('2026-01-31T10:00:00Z'), Date.parse('2026-03-30T00:00:00Z')), 1)
  const p = creditPeriod({ plan: 'gratuit', signupAt: '2026-07-15T08:00:00Z', subscription: null }, NOW)
  assert.deepEqual(p, { start: '2026-10-15T08:00:00.000Z', end: '2026-11-15T08:00:00.000Z', anchor: 'signup' })
})

test('périodes : formule payante ancrée sur current_period_start ; annuel = une période par mois du cycle', () => {
  const monthly = creditPeriod({ plan: 'premium', signupAt: '2025-01-01T00:00:00Z', subscription: { start: '2026-10-20T09:00:00Z', end: '2026-11-20T09:00:00Z' } }, NOW)
  assert.deepEqual(monthly, { start: '2026-10-20T09:00:00.000Z', end: '2026-11-20T09:00:00.000Z', anchor: 'subscription' })
  const yearly = { start: '2026-08-10T09:00:00Z', end: '2027-08-10T09:00:00Z' }
  const y = creditPeriod({ plan: 'premium', signupAt: '2025-01-01T00:00:00Z', subscription: yearly }, NOW)
  assert.deepEqual(y, { start: '2026-10-10T09:00:00.000Z', end: '2026-11-10T09:00:00.000Z', anchor: 'subscription' })
  // Dernier mois du cycle annuel : borné par current_period_end.
  const last = creditPeriod({ plan: 'premium', signupAt: '2025-01-01T00:00:00Z', subscription: { start: '2025-11-15T00:00:00Z', end: '2026-11-01T00:00:00Z' } }, NOW)
  assert.equal(last.end, '2026-11-01T00:00:00.000Z')
  // Renouvellement pas encore synchronisé : la période suivante commence exactement à l'ancienne fin.
  const late = creditPeriod({ plan: 'premium', signupAt: '2025-01-01T00:00:00Z', subscription: { start: '2026-09-28T00:00:00Z', end: '2026-10-28T00:00:00Z' } }, NOW)
  assert.equal(late.start, '2026-10-28T00:00:00.000Z')
  // Formule payante sans abonnement (attribuée à la main) : ancrage sur l'inscription.
  assert.equal(creditPeriod({ plan: 'premium', signupAt: '2026-07-15T08:00:00Z', subscription: null }, NOW).anchor, 'signup')
})

// --- Débit ---------------------------------------------------------------------------------

test('débit : A d’abord, puis lots dans l’ordre d’expiration ; insuffisant = null (jamais négatif)', () => {
  assert.deepEqual(splitDebit(3, 2, [{ id: 'x', remaining: 5 }]), { monthly: 2, lots: [{ lotId: 'x', n: 1 }] })
  assert.deepEqual(splitDebit(3, 0, [{ id: 'x', remaining: 1 }, { id: 'y', remaining: 5 }]), { monthly: 0, lots: [{ lotId: 'x', n: 1 }, { lotId: 'y', n: 2 }] })
  assert.equal(splitDebit(3, 1, [{ id: 'x', remaining: 1 }]), null)
  assert.equal(splitDebit(-1, 5, []), null)
  const lots = [
    { id: 'b', remaining: 3, expiresAt: '2028-01-01T00:00:00Z', purchasedAt: '2026-01-01T00:00:00Z' },
    { id: 'a', remaining: 3, expiresAt: '2027-01-01T00:00:00Z', purchasedAt: '2025-01-01T00:00:00Z' },
    { id: 'old', remaining: 3, expiresAt: '2026-01-01T00:00:00Z', purchasedAt: '2024-01-01T00:00:00Z' },
    { id: 'rev', remaining: 3, expiresAt: '2029-01-01T00:00:00Z', purchasedAt: '2026-01-01T00:00:00Z', revokedAt: '2026-05-01T00:00:00Z' },
  ]
  assert.deepEqual(usableLotsV6(lots, NOW).map((l) => l.id), ['a', 'b'])
})

test('clé d’idempotence : format strict', () => {
  assert.equal(parseIdempotencyKey('0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef')
  for (const bad of ['court', '', null, 42, 'a'.repeat(81), 'clé avec espaces 123456', '<script>alert(1)</script>']) assert.equal(parseIdempotencyKey(bad), null, String(bad))
})

// --- Recette ---------------------------------------------------------------------------------

test('T01 épuisement mensuel : bascule vers les crédits achetés, sinon refus explicite sans solde négatif', () => {
  const w = wallet()
  assert.equal(w.balance(A, NOW).monthly, 5)
  assert.equal(w.reserve(A, 'document_analysis', key(), NOW).outcome, 'reserved') // 5 → 2
  const r = w.reserve(A, 'document_analysis', key(), NOW)
  assert.equal(r.outcome, 'insufficient')
  assert.equal(w.balance(A, NOW).monthly, 2, 'rien débité sur un refus')
  buy(w, A, 10)
  const ok = w.reserve(A, 'document_analysis', key(), NOW)
  assert.ok(ok.outcome === 'reserved' && ok.monthlyPart === 2 && ok.purchasedPart === 1, JSON.stringify(ok))
  const b = w.balance(A, NOW)
  assert.deepEqual([b.monthly, b.purchased, b.total], [0, 9, 9])
  for (let i = 0; i < 4; i++) w.reserve(A, 'situation_analysis', key(), NOW)
  assert.equal(w.balance(A, NOW).total, 1)
  assert.equal(w.reserve(A, 'situation_analysis', key(), NOW).outcome, 'insufficient')
  assert.ok(w.lots.every((l) => l.remaining >= 0))
})

test('T02 appel IA échoué : réservation annulée, aucun crédit définitivement débité', () => {
  const w = wallet()
  buy(w, A, 10)
  w.reserve(A, 'situation_analysis', key(), NOW)
  w.reserve(A, 'situation_analysis', key(), NOW)
  const r = w.reserve(A, 'document_analysis', key(), NOW) // 1 mensuel + 2 achetés
  assert.ok(r.outcome === 'reserved')
  if (r.outcome !== 'reserved') return
  assert.equal(w.release(A, r.actionId, 'failed', NOW), 'released')
  const b = w.balance(A, NOW)
  assert.deepEqual([b.monthly, b.purchased], [1, 10])
  assert.equal(w.release(A, r.actionId, 'failed', NOW), 'not_reserved', 'restitution unique')
  assert.equal(w.confirm(A, r.actionId, 0, NOW), 'not_reserved', 'aucune confirmation après restitution')
  // Délai dépassé : restitution automatique (tâche planifiée ou prochaine action).
  const t = w.reserve(A, 'chat_question', key(), NOW)
  assert.ok(t.outcome === 'reserved')
  const later = NOW + DEFAULT_CREDIT_CONFIG.actions.chat_question.timeoutMs + RESERVATION_MARGIN_MS + 1
  assert.equal(w.sweep(later), 1)
  assert.equal(w.balance(A, later).monthly, 1)
})

test('T03 double clic : une seule opération et un seul débit par clé d’idempotence', () => {
  const w = wallet()
  const k = key()
  const r1 = w.reserve(A, 'chat_question', k, NOW)
  const r2 = w.reserve(A, 'chat_question', k, NOW)
  assert.equal(r1.outcome, 'reserved')
  assert.ok(r2.outcome === 'duplicate' && r1.outcome === 'reserved' && r2.actionId === r1.actionId)
  assert.equal(w.balance(A, NOW).monthly, 4)
  if (r1.outcome !== 'reserved') return
  assert.equal(w.confirm(A, r1.actionId, 0.01, NOW), 'confirmed')
  assert.equal(w.confirm(A, r1.actionId, 0.01, NOW), 'already', 'confirmation unique')
  assert.equal(w.reserve(A, 'chat_question', k, NOW).outcome, 'duplicate', 'même clé rejouée après succès : aucun second débit')
  assert.equal(w.balance(A, NOW).monthly, 4)
  // Une clé est propre à un compte : la même chaîne chez B est une autre opération.
  assert.equal(w.reserve(B, 'chat_question', k, NOW).outcome, 'reserved')
})

const session = (over: Partial<CreditSessionLike> = {}): CreditSessionLike => ({
  id: 'cs_test_t04t04t04t04t04', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: A,
  amount_total: 599, currency: 'eur', created: NOW / 1000, payment_intent: 'pi_t04',
  metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: A, price_cents: '599', credits: '30', validity_months: '24' },
  ...over,
})

test('T04 recharge : crédit uniquement sur session PAYÉE relue côté serveur (redirection seule insuffisante)', async () => {
  // Retour navigateur avec une session ouverte / non payée : rien.
  assert.equal(creditGrantFromSession(session({ status: 'open', payment_status: 'unpaid' })).ok, false)
  assert.equal(creditGrantFromSession(session({ payment_status: 'unpaid' })).ok, false)
  const { store, lots } = memoryCreditStore([A])
  assert.equal((await grantCreditsFromSession(store, session({ payment_status: 'unpaid' }))).outcome, 'not_paid')
  assert.equal(lots.size, 0)
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'granted')
  assert.equal([...lots.values()][0].remaining, 30)
  // Le retour de paiement relit la session chez Stripe ; le webhook aussi (jamais le payload).
  assert.match(read('app/app/coach/credits/page.tsx'), /checkout\.sessions\.retrieve\(sessionId/)
  assert.match(read('lib/billing/webhook.ts'), /checkout\.sessions\.retrieve\(session\.id\)/)
})

test('T05 webhook en double : aucun double crédit, une seule écriture « purchase »', () => {
  const w = wallet()
  const g = { sessionId: 'cs_test_t05t05t05t05t05', credits: 30, paymentIntent: 'pi_t05', purchasedAt: new Date(NOW).toISOString() }
  assert.equal(w.grant(A, g, NOW), 'granted')
  assert.equal(w.grant(A, g, NOW), 'duplicate')
  assert.equal(w.grant(B, g, NOW), 'duplicate', 'même session pour un autre compte : rien')
  assert.equal(w.ledger.filter((e) => e.type === 'purchase').length, 1)
  assert.equal(w.balance(A, NOW).purchased, 30)
  assert.equal(w.balance(B, NOW).purchased, 0)
  assert.equal(w.lots[0].expiresAt, addMonthsUtc(new Date(NOW), 24).toISOString(), 'validité 24 mois')
})

test('T06 changement de plan : crédits achetés inchangés, crédits mensuels selon la politique validée', () => {
  const w = wallet()
  const sub = { start: '2026-10-20T00:00:00Z', end: '2026-11-20T00:00:00Z' }
  w.setUser(A, { plan: 'premium', signupAt: '2026-01-01T00:00:00Z', subscription: sub })
  buy(w, A, 30)
  assert.deepEqual([w.balance(A, NOW).monthly, w.balance(A, NOW).purchased], [60, 30])
  w.setUser(A, { plan: 'coparentalite', signupAt: '2026-01-01T00:00:00Z', subscription: sub })
  assert.deepEqual([w.balance(A, NOW).monthly, w.balance(A, NOW).purchased], [200, 30])
  // Fin d'abonnement : retour au Gratuit, achetés conservés.
  w.setUser(A, { plan: 'gratuit', signupAt: '2026-01-01T00:00:00Z', subscription: null })
  assert.equal(w.balance(A, NOW).purchased, 30)
})

test('T11 fin de cycle avec crédits non utilisés : mensuels expirés (journal), achetés inchangés', () => {
  const w = wallet()
  buy(w, A, 10)
  const used = w.reserve(A, 'situation_analysis', key(), NOW) // 3 mensuels restants
  if (used.outcome === 'reserved') w.confirm(A, used.actionId, 0.01, NOW)
  const next = Date.parse('2026-11-19T12:00:01Z') // période suivante (inscription le 19)
  const b = w.balance(A, next)
  assert.equal(b.monthly, 5, 'nouvelle allocation, aucun report')
  assert.equal(b.purchased, 10)
  const exp = w.ledger.filter((e) => e.type === 'expiration' && e.wallet === 'monthly')
  assert.deepEqual(exp.map((e) => e.delta), [-3])
  w.balance(A, next)
  assert.equal(w.ledger.filter((e) => e.type === 'expiration').length, 1, 'expiration journalisée une seule fois')
  assert.equal(w.ledger.filter((e) => e.type === 'allocation').length, 2, 'une allocation par période')
  // Lot échu au bout de 24 mois : expiré au journal, hors solde.
  const far = addMonthsUtc(new Date(NOW), 24).getTime() + 1
  assert.equal(w.balance(A, far).purchased, 0)
  assert.ok(w.ledger.some((e) => e.type === 'expiration' && e.wallet === 'purchased' && e.delta === -10))
})

test('T12 achat de crédits puis résiliation : achetés conservés selon la durée affichée, aucun renouvellement', () => {
  const w = wallet()
  w.setUser(A, { plan: 'premium', signupAt: '2026-01-01T00:00:00Z', subscription: { start: '2026-10-20T00:00:00Z', end: '2026-11-20T00:00:00Z' } })
  buy(w, A, 75)
  // Résiliation à l'échéance : Stripe termine l'abonnement, users.plan repasse en Gratuit.
  const after = Date.parse('2026-11-25T00:00:00Z')
  w.setUser(A, { plan: 'gratuit', signupAt: '2026-01-01T00:00:00Z', subscription: null })
  const b = w.balance(A, after)
  assert.equal(b.purchased, 75)
  assert.equal(b.monthlyQuota, 5, 'plus d’allocation Premium')
  assert.equal(b.lots[0].expiresAt, addMonthsUtc(new Date(NOW), 24).toISOString())
})

test('T13 montée en milieu de cycle : différence positive allouée une seule fois, sans double allocation', () => {
  const w = wallet()
  const sub = { start: '2026-10-20T00:00:00Z', end: '2026-11-20T00:00:00Z' }
  w.setUser(A, { plan: 'premium', signupAt: '2026-01-01T00:00:00Z', subscription: sub })
  for (let i = 0; i < 4; i++) w.reserve(A, 'document_analysis', key(), NOW) // 12 consommés
  assert.equal(w.balance(A, NOW).monthly, 48)
  // Montée immédiate (prorata Stripe) : même période de facturation, nouveau quota.
  w.setUser(A, { plan: 'coparentalite', signupAt: '2026-01-01T00:00:00Z', subscription: sub })
  w.balance(A, NOW)
  const b = w.balance(A, NOW + 1000)
  assert.equal(b.monthly, 200 - 12)
  assert.deepEqual(w.ledger.filter((e) => e.type === 'allocation').map((e) => e.delta), [60, 140])
  // La montée reste immédiate côté abonnement.
  assert.equal(changeImpact({ plan: 'premium', cycle: 'mensuel' }, null, { plan: 'coparentalite', cycle: 'mensuel' }), 'upgrade')
})

test('T14 descente demandée : formule actuelle jusqu’à l’échéance, nouveau quota à la période suivante', () => {
  assert.equal(changeImpact({ plan: 'coparentalite', cycle: 'mensuel' }, null, { plan: 'premium', cycle: 'mensuel' }), 'scheduled')
  assert.match(read('lib/billing/change-core.ts'), /direction === 'same' \|\| direction === 'downgrade'/)
  const w = wallet()
  const sub = { start: '2026-10-20T00:00:00Z', end: '2026-11-20T00:00:00Z' }
  w.setUser(A, { plan: 'coparentalite', signupAt: '2026-01-01T00:00:00Z', subscription: sub })
  assert.equal(w.balance(A, NOW).monthly, 200)
  // À l'échéance, Stripe applique la phase suivante : Premium, nouvelle période.
  const next = Date.parse('2026-11-21T00:00:00Z')
  w.setUser(A, { plan: 'premium', signupAt: '2026-01-01T00:00:00Z', subscription: { start: '2026-11-20T00:00:00Z', end: '2026-12-20T00:00:00Z' } })
  const b = w.balance(A, next)
  assert.deepEqual([b.monthly, b.monthlyQuota], [60, 60])
})

test('T15 3e adulte : refus serveur avec message clair (trigger, hint adult_limit, FR/EN/PT)', () => {
  const sql = read('supabase/migrations/0520_credits_v6.sql')
  assert.match(sql, /create trigger trg_family_invitation_adult_limit/)
  assert.match(sql, /create trigger trg_child_guardians_adult_limit/)
  assert.match(sql, /hint = 'adult_limit'/)
  assert.match(sql, /if v_n >= 5 then[\s\S]*hint = 'children_limit'/)
  assert.match(read('lib/coparents/server/context.ts'), /adult_limit: 409/)
  for (const l of ['fr', 'en', 'pt']) {
    const msg = JSON.parse(read(`messages/${l}/server.json`)).server.coparents.hints.adult_limit as string
    assert.ok(msg && msg.length > 20, l)
    assert.ok(JSON.parse(read(`messages/${l}/shared.json`)).shared.data.errors.childrenLimit, l)
  }
})

test('T16 invité : ne dépense jamais les crédits du titulaire (plan propre, portefeuille propre)', () => {
  // Plan effectif familial : Premium pour les droits non IA…
  assert.equal(resolveEffectivePlan('gratuit', ['coparentalite']).plan, 'premium')
  // …mais les crédits suivent la formule PROPRE : l'invité Gratuit a 5 crédits, rien de plus.
  const w = wallet()
  w.setUser(A, { plan: 'coparentalite', signupAt: '2026-01-01T00:00:00Z', subscription: { start: '2026-10-20T00:00:00Z', end: '2026-11-20T00:00:00Z' } })
  buy(w, A, 30)
  assert.equal(w.balance(B, NOW).monthly, 5)
  for (let i = 0; i < 2; i++) w.reserve(B, 'situation_analysis', key(), NOW)
  assert.equal(w.reserve(B, 'situation_analysis', key(), NOW).outcome, 'insufficient')
  assert.deepEqual([w.balance(A, NOW).monthly, w.balance(A, NOW).purchased], [200, 30], 'titulaire intact')
  // Une réservation du titulaire ne peut être ni confirmée ni restituée par l'invité.
  const r = w.reserve(A, 'chat_question', key(), NOW)
  assert.ok(r.outcome === 'reserved')
  if (r.outcome === 'reserved') {
    assert.equal(w.release(B, r.actionId, 'failed', NOW), 'not_reserved')
    assert.equal(w.confirm(B, r.actionId, 0, NOW), 'not_reserved')
  }
  // Côté serveur, l'identité vient TOUJOURS de la session (jamais du corps de la requête).
  for (const f of ['app/api/coach/analyze/route.ts', 'app/api/coach/chat/route.ts']) {
    const src = read(f)
    assert.doesNotMatch(src, /reserveCredits\([^)]*(body|form|parsed\.data)\./, f)
    assert.match(src, /const user = await getCurrentUser\(\)/, f)
  }
  assert.match(read('supabase/migrations/0520_credits_v6.sql'), /Formule PROPRE \(jamais le plan effectif familial/)
})

test('T17 document volumineux / scan : contrôle taille et pages AVANT la réservation, refus compréhensible', () => {
  const pdf = (pages: number) => new TextEncoder().encode(`%PDF-1.7\n1 0 obj << /Type /Pages /Count ${pages} /Kids [] >> endobj\n` + Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj\n`).join(''))
  assert.equal(pdfPageCount(pdf(3)), 3)
  assert.equal(pdfPageCount(pdf(31)), 31)
  // Arbre compressé : seul /Count est lisible.
  assert.equal(pdfPageCount(new TextEncoder().encode('%PDF-1.7 << /Type /Pages /Count 45 >>')), 45)
  const c = cfg()
  assert.equal(documentRefusal(c, { kind: 'pdf', bytes: 1000, pages: 30 }), null)
  assert.equal(documentRefusal(c, { kind: 'pdf', bytes: 1000, pages: 31 }), 'pdf_too_many_pages')
  assert.equal(documentRefusal(c, { kind: 'pdf', bytes: 11 * 1024 * 1024, pages: 1 }), 'pdf_too_large')
  assert.equal(documentRefusal(c, { kind: 'image', bytes: 6 * 1024 * 1024 }), 'image_too_large')
  const route = read('app/api/coach/analyze/route.ts')
  assert.ok(route.indexOf('await prepare(form') < route.indexOf('reserveAnalysis(user'), 'contrôle avant réservation')
  assert.ok(route.indexOf('await prepare(form') < route.indexOf('reserveCredits(user'), 'démonstration aussi')
  assert.match(route, /pdf_too_many_pages/)
  for (const l of ['fr', 'en', 'pt']) assert.match(JSON.parse(read(`messages/${l}/ai.json`)).ai.analyze.pdfTooManyPages, /\{pages\}[\s\S]*\{max\}/)
})

test('T10 plafond de dépense : refus propre et alerte unique, sans donnée familiale', () => {
  const w = wallet()
  w.config.limits.dailySpendEurUser = 0.5
  const r = w.reserve(A, 'chat_question', key(), NOW)
  assert.ok(r.outcome === 'reserved')
  if (r.outcome === 'reserved') w.confirm(A, r.actionId, 0.6, NOW)
  assert.deepEqual(w.reserve(A, 'chat_question', key(), NOW), { outcome: 'spend_cap', scope: 'user' })
  w.reserve(A, 'chat_question', key(), NOW)
  assert.equal(w.alerts.length, 1)
  assert.deepEqual(Object.keys(w.alerts[0]).sort(), ['day', 'scope', 'userId'])
  assert.equal(w.reserve(B, 'chat_question', key(), NOW).outcome, 'reserved', 'plafond par compte')
  w.config.limits.dailySpendEurGlobal = 0.5
  assert.deepEqual(w.reserve(B, 'chat_question', key(), NOW), { outcome: 'spend_cap', scope: 'global' })
  // Lendemain (UTC) : plafond réinitialisé.
  w.config.limits.dailySpendEurGlobal = 0
  assert.equal(w.reserve(A, 'chat_question', key(), NOW + DAY).outcome, 'reserved')
})

test('T10 bis : une action restituée garde son coût fournisseur et compte dans le plafond', () => {
  const w = wallet()
  w.config.limits.dailySpendEurUser = 0.5
  const r = w.reserve(A, 'chat_question', key(), NOW)
  assert.ok(r.outcome === 'reserved')
  if (r.outcome === 'reserved') assert.equal(w.release(A, r.actionId, 'aborted', NOW, 0.6), 'released')
  assert.equal(w.balance(A, NOW).monthly, 5, 'aucun crédit débité')
  assert.deepEqual(w.reserve(A, 'chat_question', key(), NOW), { outcome: 'spend_cap', scope: 'user' })
  // Côté serveur : les routes transmettent l'usage de l'appel (final ou instantané du flux) à la restitution.
  for (const route of ['app/api/coach/analyze/route.ts', 'app/api/coach/chat/route.ts']) assert.match(read(route), /stream\?\.currentMessage/, route)
  // Chat interrompu après une réponse déjà envoyée : décompté (pas de réponse gratuite).
  assert.match(read('app/api/coach/chat/route.ts'), /f\.code === 'aborted' && text\.trim\(\)[\s\S]*?charged = true/)
})

test('pdfPageCount : temps linéaire sur un fichier piégé (pas de ReDoS)', () => {
  const evil = new TextEncoder().encode('%PDF-1.7 ' + '/Type/Pages '.repeat(200_000))
  const t0 = performance.now()
  pdfPageCount(evil)
  assert.ok(performance.now() - t0 < 1500, 'analyse bornée')
})

test('action inactive (courrier, dossier) : refusée, rien débité', () => {
  const w = wallet()
  assert.deepEqual(w.reserve(A, 'full_dossier', key(), NOW), { outcome: 'inactive' })
  assert.deepEqual(w.reserve(A, 'custom_letter', key(), NOW), { outcome: 'inactive' })
  assert.equal(w.balance(A, NOW).monthly, 5)
})

test('remboursement / litige : solde restant révoqué, restitution vers un lot révoqué impossible', () => {
  const w = wallet()
  buy(w, A, 10, NOW, 'pi_refund')
  w.reserve(A, 'document_analysis', key(), NOW) // 5 mensuels → 2
  const r = w.reserve(A, 'document_analysis', key(), NOW) // 2 mensuels + 1 acheté
  assert.equal(w.revokePayment('pi_refund', 'refund', NOW), 1)
  assert.equal(w.revokePayment('pi_refund', 'refund', NOW), 0, 'idempotent')
  assert.equal(w.balance(A, NOW).purchased, 0)
  if (r.outcome === 'reserved') w.release(A, r.actionId, 'failed', NOW)
  assert.equal(w.balance(A, NOW).purchased, 0)
  assert.equal(w.balance(A, NOW).monthly, 2)
})

test('ajustement admin : motif obligatoire, idempotent, jamais négatif, journalisé', () => {
  const w = wallet()
  assert.equal(w.adjust('admin', A, 'purchased', 5, 'abc', 'adj_000000000000001', NOW), 'invalid')
  assert.equal(w.adjust('admin', A, 'purchased', 5, 'Geste commercial', 'adj_000000000000001', NOW), 'adjusted')
  assert.equal(w.adjust('admin', A, 'purchased', 5, 'Geste commercial', 'adj_000000000000001', NOW), 'duplicate')
  assert.equal(w.balance(A, NOW).purchased, 5)
  assert.equal(w.adjust('admin', A, 'monthly', -50, 'Correction erreur', 'adj_000000000000002', NOW), 'insufficient')
  assert.equal(w.adjust('admin', A, 'purchased', -3, 'Correction erreur', 'adj_000000000000003', NOW), 'adjusted')
  assert.equal(w.balance(A, NOW).purchased, 2)
  const e = w.ledger.filter((x) => x.type === 'admin_adjustment')
  assert.ok(e.every((x) => x.adminId === 'admin' && (x.reason ?? '').length >= 5))
})

test('journal : chaque écriture a une clé d’idempotence unique ; la somme du journal = soldes', () => {
  const w = wallet()
  buy(w, A, 30)
  for (const a of ['chat_question', 'situation_analysis', 'document_analysis'] as const) w.reserve(A, a, key(), NOW)
  const r = w.reserve(A, 'document_analysis', key(), NOW)
  if (r.outcome === 'reserved') w.release(A, r.actionId, 'failed', NOW)
  const keys = w.ledger.map((e) => e.key)
  assert.equal(new Set(keys).size, keys.length)
  const b = w.balance(A, NOW)
  const sum = (wallet: 'monthly' | 'purchased') => w.ledger.filter((e) => e.userId === A && e.wallet === wallet).reduce((n, e) => n + e.delta, 0)
  assert.equal(sum('monthly'), b.monthly)
  assert.equal(sum('purchased'), b.purchased)
})

test('admin : MRR / ARR depuis les effectifs par Price (annuel ramené au mois)', () => {
  assert.deepEqual(computeMrr({ premium_monthly: 10, premium_yearly: 12, coparentalite_monthly: 2, coparentalite_yearly: 0 }), {
    mrr: Math.round((10 * 14.99 + 12 * (149 / 12) + 2 * 24.99) * 100) / 100,
    byPlan: { premium: Math.round((10 * 14.99 + 149) * 100) / 100, coparentalite: 49.98 },
  })
})

test('communication : jamais « illimité » pour l’IA ni « mois offerts » dans les catalogues de prix', () => {
  for (const l of ['fr', 'en', 'pt']) {
    const billing = read(`messages/${l}/billing.json`)
    const coach = read(`messages/${l}/coach.json`)
    for (const s of [billing, coach]) assert.doesNotMatch(s, /(Coach|IA|AI)[^"]{0,40}(illimité|unlimited|ilimitado)/i, l)
    const j = JSON.parse(billing).billing
    assert.match(j.common.discount, /environ|about|cerca/)
  }
  assert.doesNotMatch(read('lib/seo/llms.ts'), /mois offerts/)
})
