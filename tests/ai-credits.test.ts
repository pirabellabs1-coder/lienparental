/**
 * Crédits IA du Coach (cahier V6, 29/10/2026) : packs, validité 24 mois, ordre mensuels → achetés,
 * idempotence de l'achat (logique du webhook), câblage serveur, textes FR/EN/PT. Le portefeuille
 * complet (T01-T17) : tests/credits-v6.test.ts ; la base : tests/sql/scenarios/0520-credits-v6.test.mjs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { MONTHLY_CREDITS, PLAN_COMPARISON, PLAN_FEATURES } from '../components/profil/pricing'
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

test('crédits mensuels V6 : Gratuit 5, Premium 60, Coparentalité+ 200 (source unique)', () => {
  assert.deepEqual({ ...MONTHLY_CREDITS }, { gratuit: 5, premium: 60, coparentalite: 200 })
  assert.equal(ANALYSIS_QUOTA_BY_PLAN, MONTHLY_CREDITS)
  assert.ok(PLAN_FEATURES.gratuit.includes('5 crédits IA par mois'))
  assert.ok(PLAN_FEATURES.premium.includes('60 crédits IA par mois'))
  assert.ok(PLAN_FEATURES.coparentalite.includes('200 crédits IA par mois'))
  const coach = PLAN_COMPARISON.find((r) => r.key === 'coach')
  assert.deepEqual(coach?.values, { gratuit: '5 crédits / mois', premium: '60 crédits / mois', coparentalite: '200 crédits / mois' })
  // Jamais « illimité » pour l'IA.
  for (const list of Object.values(PLAN_FEATURES)) for (const feat of list) assert.doesNotMatch(feat, /illimit/i)
})

// --- Packs ---------------------------------------------------------------------------------

test('packs V6 : 10 = 2,49 €, 30 = 5,99 €, 75 = 11,99 €, 150 = 19,99 € ; validité 24 mois', () => {
  assert.deepEqual(AI_CREDIT_PACKS.map((p) => [p.id, p.credits, p.priceCents]), [
    ['pack10', 10, 249],
    ['pack30', 30, 599],
    ['pack75', 75, 1199],
    ['pack150', 150, 1999],
  ])
  assert.equal(AI_CREDIT_VALIDITY_MONTHS, 24)
  assert.equal(new Set(AI_CREDIT_PACKS.map((p) => p.id)).size, AI_CREDIT_PACKS.length)
  assert.deepEqual(AI_CREDIT_PACKS.map(packPrice), [2.49, 5.99, 11.99, 19.99])
  assert.deepEqual(AI_CREDIT_PACKS.map(packUnitPrice), [0.249, 0.2, 0.16, 0.133])
  assert.equal(bestValuePack().id, 'pack150')
})

test('pack : seule une valeur connue est acceptée (jamais un montant ni une quantité du client)', () => {
  assert.equal(parseCreditPack('pack30')?.credits, 30)
  assert.equal(parseCreditPack(['pack10'])?.credits, 10)
  // Pack désactivé dans la configuration active : refusé.
  assert.equal(parseCreditPack('pack75', AI_CREDIT_PACKS.filter((p) => p.id !== 'pack75')), null)
  for (const v of ['pack100', 'pack1000', '10', 10, '', null, undefined, { id: 'pack10' }, 'PACK10', 'pack10 ']) assert.equal(parseCreditPack(v), null, String(v))
})

test('expiration : + 24 mois calendaires, fin de mois bornée', () => {
  assert.equal(creditExpiry(new Date('2026-10-28T10:00:00Z')).toISOString(), '2028-10-28T10:00:00.000Z')
  assert.equal(creditExpiry(new Date('2028-02-29T12:00:00Z'), 12).toISOString(), '2029-02-28T12:00:00.000Z')
  assert.equal(creditExpiry(new Date('2026-03-31T00:00:00Z'), 1).toISOString(), '2026-04-30T00:00:00.000Z')
})

// --- Ordre quota → crédits, solde, expiration ---------------------------------------------------

test('ordre : quota d’abord, puis crédits, sinon refus', () => {
  assert.equal(reservationSource(0, 5, 10), 'quota')
  assert.equal(reservationSource(4, 5, 10), 'quota')
  assert.equal(reservationSource(5, 5, 10), 'credit')
  assert.equal(reservationSource(7, 5, 1), 'credit')
  assert.equal(reservationSource(5, 5, 0), null)
  // Coût 3 : 1 mensuel restant + 2 achetés suffisent ; 1 + 1 non.
  assert.equal(reservationSource(4, 5, 2, 3), 'quota')
  assert.equal(reservationSource(4, 5, 1, 3), null)
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
  assert.equal(r!.next.extraUsed, s.extraUsed, 'un crédit acheté ne compte pas dans les mensuels')
  // Analyse de document (3) : 1 sur le lot proche, 2 sur le suivant.
  assert.deepEqual(demoReserve(s, 4, 5, now, 3)!.next.lots.map((l) => l.remaining), [0, 8])
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
  metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', credits: '30', waiver_at: String(Date.parse('2026-10-28T09:59:00Z') / 1000) },
  payment_intent: 'pi_123',
  ...over,
})

test('session payée valide → crédit du pack, renonciation horodatée', () => {
  const r = creditGrantFromSession(session())
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.grant.pack.credits, 30)
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
  assert.equal(reason(session({ amount_total: 249 })), 'invalid', 'montant d’un autre pack')
  assert.equal(reason(session({ currency: 'usd' })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: OTHER } })), 'invalid', 'utilisateur incohérent')
  assert.equal(reason(session({ client_reference_id: null })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack999', user_id: USER } })), 'invalid')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', credits: '5000' } })), 'invalid', 'quantité hors bornes')
  assert.equal(reason(session({ metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: 'abc', credits: '30' } })), 'invalid')
  assert.equal(reason(session({ id: 'cs_bidon' })), 'invalid')
  assert.ok(isCreditSession(session()))
  assert.ok(!isCreditSession(session({ mode: 'subscription' })), 'un abonnement ne passe jamais par les crédits')
})

test('changement de tarif pendant la session : le prix figé dans la session fait foi', () => {
  // Session créée à 6,99 € pour 30 crédits, configuration passée à 5,99 € avant le paiement.
  const r = creditGrantFromSession(session({ amount_total: 699, metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', credits: '30' } }))
  assert.ok(r.ok && r.grant.pack.credits === 30 && r.grant.amountCents === 699)
  // Session d'avant la V6 (clé « analyses ») : même quantité.
  const v5 = creditGrantFromSession(session({ amount_total: 699, metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER, price_cents: '699', analyses: '30' } }))
  assert.ok(v5.ok && v5.grant.pack.credits === 30)
  // Session antérieure sans prix figé : comparée à la configuration courante (30 = 5,99 €).
  const legacy = creditGrantFromSession(session({ amount_total: 599, metadata: { kind: AI_CREDITS_KIND, pack: 'pack30', user_id: USER } }))
  assert.ok(legacy.ok && legacy.grant.pack.credits === 30)
})

test('webhook : une session ne crédite qu’une fois (relivraison, retour de paiement)', async () => {
  const { store, lots } = memoryCreditStore([USER])
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'granted')
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'duplicate')
  assert.equal((await grantCreditsFromSession(store, session())).outcome, 'duplicate')
  assert.equal(lots.size, 1)
  const lot = [...lots.values()][0]
  assert.equal(lot.remaining, 30)
  assert.equal(lot.expiresAt, '2028-10-28T10:00:00.000Z', 'validité 24 mois')
  // Validité figée dans la session (affichée avant paiement) : elle fait foi.
  const frozen = memoryCreditStore([USER])
  await grantCreditsFromSession(frozen.store, session({ metadata: { ...session().metadata!, validity_months: '12' } }))
  assert.equal([...frozen.lots.values()][0].expiresAt, '2027-10-28T10:00:00.000Z')
  assert.equal((await grantCreditsFromSession(store, session({ payment_status: 'unpaid', id: 'cs_test_zzzzzzzzzzzz1' }))).outcome, 'not_paid')
  assert.equal(lots.size, 1)
  const unknown = memoryCreditStore([])
  assert.equal((await grantCreditsFromSession(unknown.store, session())).outcome, 'unknown_user')
})

// --- Libération, câblage serveur ---------------------------------------------------------------

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')

test('restitution : une action échouée rend ses crédits (credits_release), réservation avant l’appel', () => {
  const route = read('app/api/coach/analyze/route.ts')
  assert.match(route, /if \(!charged\) await releaseAnalysis\(user, analysisId, reservation\.actionId, reason, call\)/)
  assert.ok(route.indexOf('reserveAnalysis(user') < route.indexOf('client.beta.messages.stream('), 'réservation AVANT l’appel au modèle')
  const chat = read('app/api/coach/chat/route.ts')
  assert.match(chat, /if \(!charged\) await releaseCredits\(user, actionId, reason, call\)/)
  assert.ok(chat.indexOf("reserveCredits(user, 'chat_question'") < chat.indexOf('client.beta.messages.stream('))
  const sql = read('supabase/migrations/0520_credits_v6.sql')
  assert.match(sql, /create or replace function public\.credits_release/)
  assert.match(sql, /set remaining = least\(quantity, remaining \+ v_n\)/)
  // Même verrou par compte pour réserver, confirmer et restituer.
  assert.ok((sql.match(/hashtextextended\('credits:' \|\| p_user_id::text, 0\)/g) ?? []).length >= 5)
  assert.match(sql, /for update/)
})

test('paiement : montant construit côté serveur, achat limité en débit', () => {
  const route = read('app/api/stripe/credits/route.ts')
  assert.match(route, /unit_amount: pack\.priceCents/)
  assert.match(route, /price_cents: String\(pack\.priceCents\)/)
  assert.match(route, /parseCreditPack\(body\.pack, packsFromConfig\(config\)\)/)
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
    ['ai', 'ai.analyze.insufficientCredits', /\{cost, plural[\s\S]*\{total\}/],
    ['ai', 'ai.errors.chatInsufficientCredits', /\{cost, plural/],
    ['coach', 'coach.cost.confirm', /\{count, plural/],
    ['coach', 'coach.credits.nextAllocation', /\{date\}/],
    ['coach', 'coach.credits.types.admin_adjustment'],
    ['account', 'account.profile.home.rows.credits'],
    ['public', 'public.legal.cgu.credits.body', /\{free\}[\s\S]*\{packs\}[\s\S]*\{chat, plural[\s\S]*\{months\}/],
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
  // CGU : non-report, validité, rétractation, résiliation.
  const cgu = ['fr', 'en', 'pt'].map((l) => get(catalog(l, 'public'), 'public.legal.cgu.credits.body') as string)
  assert.match(cgu[0], /ne sont pas reportés[\s\S]*rétractation[\s\S]*Résiliation/)
  assert.match(cgu[1], /do not carry over[\s\S]*withdrawal[\s\S]*Cancelling/)
  assert.match(cgu[2], /não se acumulam[\s\S]*arrependimento[\s\S]*cancelamento/)
})

test('FAQ FR/EN/PT : crédits V6, tarifs, environ 17 %, jamais « mois offerts »', () => {
  for (const file of ['content/faq/difference-gratuit-premium.md', 'content/i18n/en/faq/difference-gratuit-premium.md', 'content/i18n/pt/faq/difference-gratuit-premium.md']) {
    const md = read(file)
    for (const n of Object.values(MONTHLY_CREDITS)) assert.match(md, new RegExp(`- ${n} (crédits|AI credits|créditos)`), `${file}: ${n}`)
    assert.doesNotMatch(md, /mois offerts|months free|meses grátis|illimit|unlimited|ilimitad/i, file)
    assert.match(md, /17 ?%/, file)
    for (const price of ['14[,.]99', '149', '24[,.]99', '249']) assert.match(md, new RegExp(price), `${file}: ${price}`)
    for (const p of AI_CREDIT_PACKS) assert.ok(md.includes(String(packPrice(p)).replace('.', file.includes('/en/') ? '.' : ',')), `${file}: ${p.id}`)
  }
})
