/**
 * Tests unitaires des agrégats financiers (lib/journal-finances), sans dépendance :
 * `npm run test` (node:test exécuté par tsx).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonthsToDay, financeRange, sumByDevise, totalsByFlux,
  type FinanceFilters, type JournalDepense,
} from '../lib/journal-finances'

type Item = { date: string; childIds: string[]; depense?: JournalDepense }
const op = (montantCents: number, d: Partial<JournalDepense> = {}): Item => ({
  date: '2026-10-10', childIds: ['c_1'],
  depense: { montantCents, devise: 'EUR', categorie: 'ecole', mode: 'carte', ...d },
})

test('totalsByFlux : sorties, entrées, tiers et reste dû au montant réglé', () => {
  const t = totalsByFlux([
    op(10_000), // dépense payée, payeur non précisé = moi
    op(5_000, { sens: 'remboursement-verse', payeurType: 'moi' }),
    op(18_000, { statut: 'partiel', montantPayeCents: 12_000 }), // 120 réglés, 60 dus
    op(999, { statut: 'en-attente' }), // 0 réglé, 9,99 dus
    op(3_990, { payeurType: 'autre-parent' }), // tiers
    op(41_694, { sens: 'recu', payeurType: 'organisme', beneficiaireType: 'moi' }),
    op(2_000, { sens: 'remboursement-recu', beneficiaireType: 'autre-parent' }), // versé à un tiers
    { date: '2026-10-10', childIds: [] }, // entrée sans détail financier : ignorée
  ])
  assert.deepEqual(t.sortie, [{ devise: 'EUR', cents: 10_000 + 5_000 + 12_000 }])
  assert.deepEqual(t.entree, [{ devise: 'EUR', cents: 41_694 }])
  assert.deepEqual(t.solde, [{ devise: 'EUR', cents: 41_694 - 27_000 }])
  assert.deepEqual(t.tiers, [{ devise: 'EUR', cents: 3_990 + 2_000 }])
  assert.deepEqual(t.aRegler, [{ devise: 'EUR', cents: 6_000 + 999 }])
})

test('totalsByFlux : devises séparées, EUR en premier, jamais additionnées', () => {
  const t = totalsByFlux([op(1_000, { devise: 'USD' }), op(2_000), op(500, { devise: 'BRL', sens: 'recu' })])
  assert.deepEqual(t.sortie, [{ devise: 'EUR', cents: 2_000 }, { devise: 'USD', cents: 1_000 }])
  assert.deepEqual(t.solde, [{ devise: 'EUR', cents: -2_000 }, { devise: 'BRL', cents: 500 }, { devise: 'USD', cents: -1_000 }])
})

test('totalsByFlux : liste vide', () => {
  assert.deepEqual(totalsByFlux([]), { sortie: [], entree: [], solde: [], tiers: [], aRegler: [] })
})

test('sumByDevise : montants déclarés des sens sortants, quel que soit le payeur ou le statut', () => {
  const t = sumByDevise([
    op(10_000),
    op(3_990, { payeurType: 'autre-parent' }), // compté (montant déclaré)
    op(999, { statut: 'en-attente' }), // compté pour le montant total
    op(1_995, { sens: 'remboursement-verse' }),
    op(41_694, { sens: 'recu' }), // exclu
    op(500, { sens: 'remboursement-recu' }), // exclu
    op(700, { devise: 'SRD' }),
  ])
  assert.deepEqual(t, [{ devise: 'EUR', cents: 10_000 + 3_990 + 999 + 1_995 }, { devise: 'SRD', cents: 700 }])
})

const F = (f: Partial<FinanceFilters>): FinanceFilters => ({ periode: 'mois', ...f })

test('financeRange : mois, 3 et 12 derniers mois', () => {
  assert.deepEqual(financeRange(F({}), '2026-02', '2026-10-26'), { fromDay: '2026-02-01', toDay: '2026-02-28' })
  assert.deepEqual(financeRange(F({}), '2024-02', '2026-10-26'), { fromDay: '2024-02-01', toDay: '2024-02-29' })
  assert.deepEqual(financeRange(F({ periode: '3m' }), '2026-10', '2026-10-26'), { fromDay: '2026-08-01', toDay: '2026-10-26' })
  assert.deepEqual(financeRange(F({ periode: '12m' }), '2026-10', '2026-01-15'), { fromDay: '2025-02-01', toDay: '2026-01-15' })
})

test('financeRange : dates personnalisées plafonnées à aujourd’hui (du ET au)', () => {
  const today = '2026-10-26'
  assert.deepEqual(financeRange(F({ periode: 'perso', du: '2026-09-01', au: '2026-09-30' }), '2026-10', today), { fromDay: '2026-09-01', toDay: '2026-09-30' })
  assert.deepEqual(financeRange(F({ periode: 'perso', du: '2026-09-01', au: '2027-01-01' }), '2026-10', today), { fromDay: '2026-09-01', toDay: today })
  // `du` dans le futur : plafonné, jamais une période qui commence après aujourd'hui.
  assert.deepEqual(financeRange(F({ periode: 'perso', du: '2027-03-01' }), '2026-10', today), { fromDay: today, toDay: today })
  assert.deepEqual(financeRange(F({ periode: 'perso', du: '2027-03-01', au: '2026-10-01' }), '2026-10', today), { fromDay: '2026-10-01', toDay: today })
  // Bornes inversées : remises dans l'ordre.
  assert.deepEqual(financeRange(F({ periode: 'perso', du: '2026-10-20', au: '2026-10-01' }), '2026-10', today), { fromDay: '2026-10-01', toDay: '2026-10-20' })
  // Sans dates : du 1er du mois courant à aujourd'hui.
  assert.deepEqual(financeRange(F({ periode: 'perso' }), '2026-10', today), { fromDay: '2026-10-01', toDay: today })
})

test('addMonthsToDay : fin de mois bornée, changement d’année, années bissextiles', () => {
  assert.equal(addMonthsToDay('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsToDay('2024-01-31', 1), '2024-02-29')
  assert.equal(addMonthsToDay('2026-03-31', -1), '2026-02-28')
  assert.equal(addMonthsToDay('2026-12-15', 1), '2027-01-15')
  assert.equal(addMonthsToDay('2026-01-10', -1), '2025-12-10')
  assert.equal(addMonthsToDay('2024-02-29', 12), '2025-02-28')
  assert.equal(addMonthsToDay('2026-08-31', 3), '2026-11-30')
  assert.equal(addMonthsToDay('2026-10-25', 0), '2026-10-25')
})
