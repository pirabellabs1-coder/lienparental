/** Formules payantes : libellés de prix dérivés et plan effectif (accès partagé Coparentalité+). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAN_COMPARISON,
  PLAN_FEATURES,
  PLAN_LABEL,
  PLAN_NAME,
  PRICING,
  derivePlanPricing,
  formatPrice,
  parseCycle,
  parsePaidPlan,
  planLabel,
  priceFor,
  priceForPlan, planPromo } from '../components/profil/pricing'
import {
  ANALYSIS_QUOTA_BY_PLAN,
  dbTierFor,
  hasFeature,
  maxPlan,
  offerFromSubscriptionPlan,
  planDirection,
  planFromDbTier,
  resolveEffectivePlan,
  sameOffer,
  storageGbFor,
  subscriptionPlanFor,
  supportPriorityFor,
} from '../lib/billing/plans'

// Intl insère des espaces insécables (U+00A0 / U+202F) : on les normalise pour comparer.
const plain = (s: string) => s.replace(/[  ]/g, ' ')

// --- Libellés de prix -----------------------------------------------------------

test('Premium V6 : 14,99 €/mois, 149 €/an, environ 17 % (jamais « mois offerts »)', () => {
  assert.equal(PRICING.monthly, 14.99)
  assert.equal(PRICING.yearly, 149)
  assert.equal(PRICING.yearlyReference, 179.88)
  assert.equal(PRICING.yearlySavings, 30.88)
  assert.equal(PRICING.yearlyPerMonth, 12.42)
  assert.equal(PRICING.freeMonthsLabel, 'environ -17 %')
  assert.equal(PRICING.discountLabel, 'environ -17 %')
  assert.equal(PRICING.discountShortLabel, 'Économisez environ 17 %')
  assert.deepEqual(planPromo('premium'), { freeMonths: 0, discountPct: 17 })
  // Les champs à plat et PRICING.premium sont la même source.
  assert.equal(PRICING.premium.monthly, PRICING.monthly)
  assert.equal(PRICING.premium.freeMonthsLabel, PRICING.freeMonthsLabel)
})

test('Coparentalité+ V6 : 24,99 €/mois, 249 €/an, environ 17 % ; coffre-fort 25 Go', () => {
  const c = PRICING.coparentalite
  assert.equal(c.monthly, 24.99)
  assert.equal(c.yearly, 249)
  assert.equal(c.yearlyReference, 299.88)
  assert.equal(c.yearlySavings, 50.88)
  assert.equal(c.yearlyPerMonth, 20.75)
  // 16,97 % : arrondi à « environ 17 % », jamais tronqué à 16 ni « 2 mois offerts ».
  assert.equal(c.discountLabel, 'environ -17 %')
  assert.equal(c.discountShortLabel, 'Économisez environ 17 %')
  assert.deepEqual(planPromo('coparentalite'), { freeMonths: 0, discountPct: 17 })
  assert.deepEqual({ ...PRICING.storage }, { free: 2, premium: 10, coparentalite: 25 })
})

test('derivePlanPricing : sans économie suffisante, pas de « mois offerts »', () => {
  const p = derivePlanPricing(10, 115)
  assert.equal(p.yearlySavings, 5)
  assert.equal(p.freeMonthsLabel, 'environ -4 %')
  // Annuel plus cher que 12 mensualités : jamais de remise négative affichée.
  assert.equal(derivePlanPricing(10, 130).discountLabel, 'environ -0 %')
})

test('formatPrice au format français', () => {
  assert.equal(plain(formatPrice(24.99)), '24,99 €')
  assert.equal(plain(formatPrice(249)), '249,00 €')
  assert.equal(plain(formatPrice(PRICING.coparentalite.yearlyPerMonth)), '20,75 €')
})

test('libellés de formule', () => {
  assert.equal(planLabel('coparentalite', 'mensuel'), 'Coparentalité+ mensuel')
  assert.equal(planLabel('coparentalite', 'annuel'), 'Coparentalité+ annuel')
  assert.equal(planLabel('premium', 'annuel'), 'Premium annuel')
  assert.deepEqual(PLAN_LABEL, { mensuel: 'Premium mensuel', annuel: 'Premium annuel' })
  assert.equal(PLAN_NAME.coparentalite, 'Coparentalité+')
  // Charte : aucun tiret cadratin dans les textes visibles.
  const texts = [...Object.values(PLAN_FEATURES).flat(), ...PLAN_COMPARISON.flatMap(r => [r.label, ...Object.values(r.values).filter(v => typeof v === 'string')])]
  for (const t of texts) assert.ok(!String(t).includes('—'), t as string)
})

test('prix par formule et cycle', () => {
  assert.equal(priceForPlan('coparentalite', 'mensuel'), 24.99)
  assert.equal(priceForPlan('coparentalite', 'annuel'), 249)
  assert.equal(priceForPlan('premium', 'annuel'), 149)
  assert.equal(priceFor('mensuel'), 14.99)
})

test('paramètres d’URL', () => {
  assert.equal(parsePaidPlan('coparentalite'), 'coparentalite')
  assert.equal(parsePaidPlan(['coparentalite']), 'coparentalite')
  assert.equal(parsePaidPlan('admin'), 'premium')
  assert.equal(parsePaidPlan(undefined), 'premium')
  assert.equal(parseCycle('annuel'), 'annuel')
  assert.equal(parseCycle('x'), 'mensuel')
})

test('comparatif : Coparentalité+ inclut au moins tout ce que Premium inclut', () => {
  for (const row of PLAN_COMPARISON) {
    if (row.values.premium === true) assert.equal(row.values.coparentalite, true, row.label)
  }
  assert.ok(PLAN_FEATURES.coparentalite.includes('Tout Premium'))
})

// --- Correspondances SQL / Stripe ------------------------------------------------

test('subscriptions.plan ↔ formule', () => {
  assert.equal(subscriptionPlanFor({ plan: 'coparentalite', cycle: 'annuel' }), 'coparentalite_yearly')
  assert.equal(subscriptionPlanFor({ plan: 'premium', cycle: 'mensuel' }), 'premium_monthly')
  assert.deepEqual(offerFromSubscriptionPlan('coparentalite_monthly'), { plan: 'coparentalite', cycle: 'mensuel' })
  assert.deepEqual(offerFromSubscriptionPlan('premium_yearly'), { plan: 'premium', cycle: 'annuel' })
  assert.deepEqual(offerFromSubscriptionPlan(null), { plan: 'premium', cycle: 'mensuel' })
  assert.ok(sameOffer({ plan: 'premium', cycle: 'annuel' }, { plan: 'premium', cycle: 'annuel' }))
  assert.ok(!sameOffer({ plan: 'premium', cycle: 'annuel' }, null))
})

test('users.plan ↔ niveau applicatif', () => {
  assert.equal(planFromDbTier('coparentalite'), 'coparentalite')
  assert.equal(planFromDbTier('premium'), 'premium')
  assert.equal(planFromDbTier('free'), 'gratuit')
  assert.equal(planFromDbTier('admin'), 'gratuit') // un admin n'a aucun avantage payant propre
  assert.equal(planFromDbTier(undefined), 'gratuit')
  assert.equal(dbTierFor('gratuit'), 'free')
  assert.equal(dbTierFor('coparentalite'), 'coparentalite')
})

test('ordre des niveaux et sens du changement', () => {
  assert.equal(planDirection('premium', 'coparentalite'), 'upgrade')
  assert.equal(planDirection('coparentalite', 'premium'), 'downgrade')
  assert.equal(planDirection('premium', 'premium'), 'same')
  assert.equal(maxPlan('premium', 'coparentalite'), 'coparentalite')
  assert.equal(maxPlan('gratuit', 'premium'), 'premium')
})

// --- Plan effectif (accès partagé) ------------------------------------------------

test('plan effectif : abonnement propre', () => {
  assert.deepEqual(resolveEffectivePlan('gratuit'), { plan: 'gratuit', own: 'gratuit', via: null })
  assert.deepEqual(resolveEffectivePlan('premium'), { plan: 'premium', own: 'premium', via: 'abonnement' })
  assert.deepEqual(resolveEffectivePlan('coparentalite'), { plan: 'coparentalite', own: 'coparentalite', via: 'abonnement' })
})

test('plan effectif : un parent lié en Coparentalité+ apporte Premium (pas Coparentalité+)', () => {
  assert.deepEqual(resolveEffectivePlan('gratuit', ['coparentalite']), { plan: 'premium', own: 'gratuit', via: 'famille' })
  assert.deepEqual(resolveEffectivePlan('gratuit', ['gratuit', 'coparentalite', 'premium']), { plan: 'premium', own: 'gratuit', via: 'famille' })
})

test('plan effectif : Premium ne se partage pas, et un abonné garde son propre niveau', () => {
  assert.equal(resolveEffectivePlan('gratuit', ['premium']).plan, 'gratuit')
  assert.deepEqual(resolveEffectivePlan('premium', ['coparentalite']), { plan: 'premium', own: 'premium', via: 'abonnement' })
  assert.equal(resolveEffectivePlan('coparentalite', ['coparentalite']).plan, 'coparentalite')
})

test('droits selon le plan effectif', () => {
  const famille = resolveEffectivePlan('gratuit', ['coparentalite']).plan
  assert.ok(hasFeature(famille, 'coach_quota_etendu'))
  assert.ok(hasFeature(famille, 'stockage_etendu'))
  // Pas de ricochet : export avancé et assistance prioritaire restent au titulaire de la formule.
  assert.ok(!hasFeature(famille, 'export_avance'))
  assert.ok(!hasFeature(famille, 'assistance_prioritaire'))
  assert.ok(!hasFeature(famille, 'acces_partage'))
  assert.ok(hasFeature('coparentalite', 'export_avance'))
  assert.ok(hasFeature('coparentalite', 'suivi_depenses_renforce'))
  assert.ok(!hasFeature('premium', 'export_avance'))
  assert.ok(!hasFeature('gratuit', 'coach_quota_etendu'))
})

test('quotas, stockage et priorité support par niveau', () => {
  assert.deepEqual(ANALYSIS_QUOTA_BY_PLAN, { gratuit: 5, premium: 60, coparentalite: 200 })
  assert.equal(storageGbFor('gratuit'), 2)
  assert.equal(storageGbFor('coparentalite'), 25)
  assert.equal(supportPriorityFor('gratuit'), 'low')
  assert.equal(supportPriorityFor('premium'), 'normal')
  assert.equal(supportPriorityFor('coparentalite'), 'high')
})
