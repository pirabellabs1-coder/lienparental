/**
 * Crédits d'analyses du Coach IA et nouveaux quotas (28/10/2026) :
 * configuration des packs, ordre quota → crédits, expiration, idempotence de l'achat (logique du
 * webhook), libération, textes FR/EN/PT. La partie base (verrou, FOR UPDATE, RLS, release_ai_usage)
 * est couverte par tests/sql/scenarios/0510-credits.test.mjs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { COACH_ANALYSES, PLAN_COMPARISON, PLAN_FEATURES } from '../components/profil/pricing'
import { ANALYSIS_QUOTA_BY_PLAN } from '../lib/billing/plans'
import {
  AI_CREDIT_PACKS,
  AI_CREDIT_VALIDITY_MONTHS,
  AI_CREDITS_KIND,
  bestValuePack,
  creditExpiry,
  packPrice,
  packUnitPrice,
  parseCreditPack,
} from '../lib/billing/credit-packs'
import {
  creditBalance,
  creditGrantFromSession,
  demoAddCredits,
  demoReserve,
  emptyDemoAi,
  grantCreditsFromSession,
  isCreditSession,
  memoryCreditStore,
  parseDemoAi,
  reservationSource,
  serializeDemoAi,
  usableLots,
  type CreditSessionLike,
} from '../lib/ai/credits-core'
import { BILLING_RATE_LIMITS } from '../lib/billing/limits'

const ROOT = process.cwd()
const DAY = 86_400_000
const USER = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'

// --- Quotas -------------------------------------------------------------------------------

test('quotas mensuels : Gratuit 5, Premium 50, Coparentalité+ 100 (source unique)', () => {
  assert.deepEqual({ ...COACH_ANALYSES }, { gratuit: 5, premium: 50, coparentalite: 100 })
  assert.equal(ANALYSIS_QUOTA_BY_PLAN, COACH_ANALYSES)
  assert.ok(PLAN_FEATURES.gratuit.includes('5 analyses du Coach IA par mois'))
  assert.ok(PLAN_FEATURES.premium.includes('50 analyses du Coach IA par mois'))
  assert.ok(PLAN_FEATURES.coparentalite.includes('100 analyses du Coach IA par mois'))
  const coach = PLAN_COMPARISON.find((r) => r.key === 'coach')
  assert.deepEqual(coach?.values, { gratuit: '5 analyses / mois', premium: '50 analyses / mois', coparentalite: '100 analyses / mois' })
})

// --- Packs ---------------------------------------------------------------------------------

test('packs : 10 = 2,99 €, 30 = 6,99 €, 100 = 19,99 € ; validité 12 mois', () => {
  assert.deepEqual(AI_CREDIT_PACKS.map((p) => [p.id, p.analyses, p.priceCents]), [
    ['pack10', 10, 299],
    ['pack30', 30, 699],
    ['pack100', 100, 1999],
  ])
  assert.equal(AI_CREDIT_VALIDITY_MONTHS, 12)
  assert.equal(new Set(AI_CREDIT_PACKS.map((p) => p.id)).size, AI_CREDIT_PACKS.length)
  assert.deepEqual(AI_CREDIT_PACKS.map(packPrice), [2.99, 6.99, 19.99])
  assert.deepEqual(AI_CREDIT_PACKS.map(packUnitPrice), [0.3, 0.23, 0.2])
  assert.equal(bestValuePack().id, 'pack100')
})

test('pack : seule une valeur connue est acceptée (jamais un montant ni une quantité du client)', () => {
  assert.equal(parseCreditPack('pack30')?.analyses, 30)
  assert.equal(parseCreditPack(['pack10'])?.analyses, 10)
  for (const v of ['pack1000', '10', 10, '', null, undefined, { id: 'pack10' }, 'PACK10', 'pack10 ']) assert.equal(parseCreditPack(v), null, String(v))
})

test('expiration : + 12 mois calendaires, fin de mois bornée', () => {
  assert.equal(creditExpiry(new Date('2026-10-28T10:00:00Z')).toISOString(), '2027-10-28T10:00:00.000Z')
  assert.equal(creditExpiry(new Date('2028-02-29T12:00:00Z')).toISOString(), '2029-02-28T12:00:00.000Z')
  assert.equal(creditExpiry(new Date('2026-03-31T00:00:00Z'), 1).toISOString(), '2026-04-30T00:00:00.000Z')
})

// --- Ordre quota → crédits, solde, expiration ---------------------------------------------------

test('ordre : quota d’abord, puis crédits, sinon refus', () => {
  assert.equal(reservationSource(0, 5, 10), 'quota')
  assert.equal(reservationSource(4, 5, 10), 'quota')
  assert.equal(reservationSource(5, 5, 10), 'credit')
  assert.equal(reservationSource(7, 5, 1), 'credit')
  assert.equal(reservationSource(5, 5, 0), null)
})

test('solde : lots expirés ou vides ignorés, expiration la plus proche', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  const lots = [
    { remaining: 5, expiresAt: '2026-10-01T00:00:00Z' }, // expiré
    { remaining: 0, expiresAt: '2027-01-01T00:00:00Z' }, // vide
    { remaining: 30, expiresAt: '2027-09-01T00:00:00Z' },
    { remaining: 3, expiresAt: '2027-02-01T00:00:00Z' },
  ]
  assert.deepEqual(creditBalance(lots, now), { balance: 33, nextExpiry: '2027-02-01T00:00:00Z' })
  assert.deepEqual(usableLots(lots, now).map((l) => l.remaining), [3, 30])
  assert.deepEqual(creditBalance([], now), { balance: 0, nextExpiry: null })
  assert.deepEqual(creditBalance(lots, Date.parse('2027-10-01T00:00:00Z')), { balance: 0, nextExpiry: null })
})

test('démonstration : quota, puis crédit du lot le plus ancien, puis refus', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  let s = emptyDemoAi()
  // Gratuit : 4 analyses déjà comptées sur 5.
  let r = demoReserve(s, 4, 5, now)
  assert.equal(r?.source, 'quota')
  s = r!.next
  assert.equal(demoReserve(s, 4, 5, now), null, 'quota atteint, aucun crédit')
  s = demoAddCredits(s, parseCreditPack('pack10')!, now)
  s = { ...s, lots: [{ remaining: 1, expiresDay: Math.floor((now + 30 * DAY) / DAY) }, ...s.lots] }
  r = demoReserve(s, 4, 5, now)
  assert.equal(r?.source, 'credit')
  assert.deepEqual(r!.next.lots.map((l) => l.remaining), [0, 10], 'lot le plus proche de l’expiration consommé d’abord')
  assert.equal(r!.next.extraUsed, s.extraUsed, 'un crédit ne compte pas dans le quota')
  // Lot expiré : jamais consommé.
  const expired = { extraUsed: 1, lots: [{ remaining: 4, expiresDay: Math.floor((now - DAY) / DAY) }] }
  assert.equal(demoReserve(expired, 4, 5, now), null)
})

test('démonstration : cookie sérialisé / relu, valeurs invalides rejetées', () => {
  const s = { extraUsed: 3, lots: [{ remaining: 10, expiresDay: 21000 }, { remaining: 2, expiresDay: 21100 }] }
  assert.deepEqual(parseDemoAi(serializeDemoAi(s)), s)
  assert.deepEqual(parseDemoAi('0|'), { extraUsed: 0, lots: [] })
  for (const bad of ['', 'x|', '1|10', '1|-5-2', '99999|', '1|10-2;rm']) assert.equal(parseDemoAi(bad), null, bad)
})

// --- Achat : validation de session et idempotence (logique du webhook) -----------------------------

const session = (over: Partial<CreditSessionLike> = {}): CreditSessionLike => ({
  id: 'cs_test_a1B2c3D4e5F6g7H8',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  client_reference_id: USER,
  amount_total: 699,
  currency: 'eur',
  created: Date.parse('2026-10-28T10:00:00Z') / 1000,
  metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', analyses: '30', waiver_at: String(Date.parse('2026-10-28T09:59:00Z') / 1000) },
  payment_intent: 'pi_123',
  ...over,
})

test('session payée valide → crédit du pack, renonciation horodatée', () => {
  const r = creditGrantFromSession(session())
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.grant.pack.analyses, 30)
  assert.equal(r.grant.userId, USER)
  assert.equal(r.grant.purchasedAt, '2026-10-28T10:00:00.000Z')
  assert.equal(r.grant.waiverAt, '2026-10-28T09:59:00.000Z')
  assert.equal(r.grant.paymentIntent, 'pi_123')
})

test('session refusée : non payée, autre type, montant / devise / utilisateur incohérents', () => {
  const reason = (s: CreditSessionLike) => {
    const r = creditGrantFromSession(s)
    return r.ok ? 'ok' : r.reason
  }
  assert.equal(reason(session({ payment_status: 'unpaid' })), 'not_paid')
  assert.equal(reason(session({ status: 'open' })), 'not_paid')
  assert.equal(reason(session({ mode: 'subscription' })), 'not_credits')
  assert.equal(reason(session({ metadata: { pack: 'pack30', user_id: USER } })), 'not_credits')
  assert.equal(reason(session({ amount_total: 1 })), 'invalid', 'montant différent de la configuration')
  assert.equal(reason(session({ amount_total: 299 })), 'invalid', 'montant d’un autre pack')
  assert.equal(reason(session({ currency: 'usd' })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: OTHER } })), 'invalid', 'utilisateur incohérent')
  assert.equal(reason(session({ client_reference_id: null })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack999', user_id: USER } })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', analyses: '5000' } })), 'invalid', 'quantité hors bornes')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: 'abc', analyses: '30' } })), 'invalid')
  assert.equal(reason(session({ id: 'cs_bidon' })), 'invalid')
  assert.ok(isCreditSession(session()))
  assert.ok(!isCreditSession(session({ mode: 'subscription' })), 'un abonnement ne passe jamais par les crédits')
})

test('changement de tarif pendant la session : le prix figé dans la session fait foi', () => {
  // Session créée à 5,99 € pour 30 analyses, configuration passée à 6,99 € avant le paiement.
  const r = creditGrantFromSession(session({ amount_total: 599, metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '599', analyses: '30' } }))
  assert.ok(r.ok && r.grant.pack.analyses === 30 && r.grant.amountCents === 599)
  // Session antérieure sans prix figé : comparée à la configuration courante.
  const legacy = creditGrantFromSession(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER } }))
  assert.ok(legacy.ok && legacy.grant.pack.analyses === 30)
})

test('webhook : une session ne crédite qu’une fois (relivraison, retour de paiement)', async () => {
  const { store, lots } = memoryCreditStore([USER])
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'granted')
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'duplicate')
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'duplicate')
  assert.equal(lots.size, 1)
  const lot = [...lots.values()][0]
  assert.equal(lot.remaining, 30)
  assert.equal(lot.expiresAt, '2027-10-28T10:00:00.000Z')
  assert.equal((await grantCreditsFromSession(store, session({ payment_status: 'unpaid', id: 'cs_test_zzzzzzzzzzzz1' }))).outcome, 'not_paid')
  assert.equal(lots.size, 1)
  const unknown = memoryCreditStore([])
  assert.equal((await grantCreditsFromSession(unknown.store, session())).outcome, 'unknown_user')
})

// --- Libération, câblage serveur ---------------------------------------------------------------

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')

test('libération : une analyse échouée rend le quota ou le crédit (release_ai_usage)', () => {
  const analyses = read('lib/ai/analyses.ts')
  assert.match(analyses, /rpc\('release_ai_usage'/)
  const route = read('app/api/coach/analyze/route.ts')
  assert.match(route, /if \(!charged\) await releaseAnalysis\(user, analysisId\)/)
  const sql = read('supabase/migrations/0510_ai_credits.sql')
  assert.match(sql, /create or replace function public\.release_ai_usage/)
  assert.match(sql, /set remaining = remaining \+ 1/)
  // Même verrou que reserve_ai_usage : pas de double consommation sous concurrence.
  assert.equal((sql.match(/hashtextextended\('ai_usage:' \|\| p_user_id::text \|\| ':analysis', 0\)/g) ?? []).length, 2)
  assert.match(sql, /for update/)
})

test('paiement : montant construit côté serveur, achat limité en débit', () => {
  const route = read('app/api/stripe/credits/route.ts')
  assert.match(route, /unit_amount: pack\.priceCents/)
  assert.match(route, /price_cents: String\(pack\.priceCents\)/)
  assert.match(route, /parseCreditPack\(body\.pack\)/)
  assert.doesNotMatch(route, /body\.(amount|price|quantity|unit_amount)/)
  assert.match(route, /isSameOrigin\(req\)/)
  assert.match(route, /limitBilling\('credits'/)
  assert.ok(BILLING_RATE_LIMITS.credits.limit > 0)
})

// --- Textes FR / EN / PT -------------------------------------------------------------------------

const catalog = (l: string, mod: string) => JSON.parse(read(`messages/${l}/${mod}.json`))
const get = (o: unknown, key: string) => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)

test('textes FR/EN/PT : crédits, quota épuisé, CGU, profil', () => {
  const keys: Array<[string, string, RegExp?]> = [
    ['coach', 'coach.credits.title'],
    ['coach', 'coach.credits.waiver'],
    ['coach', 'coach.credits.pay'],
    ['coach', 'coach.credits.payDemo'],
    ['coach', 'coach.credits.demoNotice'],
    ['coach', 'coach.credits.success', /\{count, plural/],
    ['coach', 'coach.credits.errors.waiver_required'],
    ['coach', 'coach.analysis.buyCredits'],
    ['coach', 'coach.usage.credits.balance', /\{count, plural/],
    ['coach', 'coach.usage.credits.buy'],
    ['ai', 'ai.analyze.quotaExceededFree', /\{premium\}/],
    ['ai', 'ai.analyze.quotaExceededPaid', /\{quota\}/],
    ['account', 'account.profile.home.rows.credits'],
    ['public', 'public.legal.cgu.credits.body', /\{packs\}[\s\S]*\{months\}/],
    ['billing', 'billing.features.gratuit.coach', /\{count\}/],
    ['billing', 'billing.features.coparentalite.coach', /\{count\}/],
    ['billing', 'billing.comparison.cells.coach.coparentalite', /\{count\}/],
    ['billing', 'billing.paywall.coach.text', /\{free\}[\s\S]*\{premium\}/],
  ]
  for (const l of ['fr', 'en', 'pt']) {
    for (const [mod, key, re] of keys) {
      const v = get(catalog(l, mod), key)
      assert.equal(typeof v, 'string', `${l}: ${key}`)
      assert.ok((v as string).length > 0, `${l}: ${key}`)
      if (re) assert.match(v as string, re, `${l}: ${key}`)
    }
    // Plus aucun ancien chiffre codé en dur dans les catalogues de facturation et d'IA.
    for (const mod of ['billing', 'ai']) assert.doesNotMatch(read(`messages/${l}/${mod}.json`), /\b(3|10) (analyses|análises|AI Coach analyses)\b/, `${l}/${mod}`)
  }
  const waiver = ['fr', 'en', 'pt'].map((l) => get(catalog(l, 'coach'), 'coach.credits.waiver') as string)
  assert.match(waiver[0], /droit de rétractation/)
  assert.match(waiver[1], /right of withdrawal/)
  assert.match(waiver[2], /direito de arrependimento/)
})

test('FAQ FR/EN/PT : nouveaux quotas et packs', () => {
  for (const f of ['content/faq/difference-gratuit-premium.md', 'content/i18n/en/faq/difference-gratuit-premium.md', 'content/i18n/pt/faq/difference-gratuit-premium.md']) {
    const md = read(f)
    for (const n of Object.values(COACH_ANALYSES)) assert.match(md, new RegExp(`- ${n} (analyses|AI Coach|análises)`), `${f}: ${n}`)
    assert.doesNotMatch(md, /- (3|10) (analyses|AI Coach|análises)/, f)
    for (const p of AI_CREDIT_PACKS) assert.ok(md.includes(String(packPrice(p)).replace('.', f.includes('/en/') ? '.' : ',')), `${f}: ${p.id}`)
  }
})
