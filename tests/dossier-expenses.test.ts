/**
 * Section « Dépenses et pension » du dossier JAF (components/dossier/expenses) :
 * chaque opération dans une seule liste, totaux = somme des lignes affichées (montant réglé).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoDepenseEntries, montantRegleCents, resteDuCents, type Totals } from '../lib/journal-finances'
import { expenseAmount, expenseParties, summarizeExpenses, type DossierExpense, type ExpenseGroup } from '../components/dossier/expenses'

const NOW = new Date('2026-10-26T15:00:00Z')
const demo = (): DossierExpense[] =>
  demoDepenseEntries(NOW).map((e) => ({ ...e, type: 'depense' }) as unknown as DossierExpense)

const eur = (t: Totals) => t.find((x) => x.devise === 'EUR')?.cents ?? 0
const sumLines = (g: ExpenseGroup, f: (e: DossierExpense) => number) => g.items.reduce((n, e) => n + f(e), 0)
const nb = (s: string) => s.replace(/[  ]/g, ' ')

test('démo : chaque opération figure dans une seule liste', () => {
  const list = demo()
  const x = summarizeExpenses(list)
  const ids = [...x.depenses.items, ...x.recues.items, ...x.tiers.items].map((e) => e.id)
  assert.equal(ids.length, list.length)
  assert.equal(new Set(ids).size, list.length)
})

test('démo : chaussures réglées par l’autre parent hors de mes dépenses, remboursement versé compté une fois', () => {
  const x = summarizeExpenses(demo())
  const where = (id: string) => (['depenses', 'recues', 'tiers'] as const).filter((k) => x[k].items.some((e) => e.id === id))
  assert.deepEqual(where('jd_f_3'), ['tiers']) // chaussures 39,90 €, payeur autre parent
  assert.deepEqual(where('jd_ex_remb'), ['depenses']) // remboursement versé 19,95 €
  assert.deepEqual(where('jd_ex_caf'), ['recues']) // allocation de rentrée
  assert.equal(x.depenses.items.find((e) => e.id === 'jd_ex_remb')?.depense.montantCents, 1_995)
})

test('démo : chaque total = somme des lignes affichées, en montant réglé, reste dû à part', () => {
  const x = summarizeExpenses(demo())
  for (const g of [x.depenses, x.recues, x.tiers]) {
    assert.equal(eur(g.totals), sumLines(g, (e) => montantRegleCents(e.depense)))
    assert.equal(eur(g.reste), sumLines(g, (e) => resteDuCents(e.depense)))
  }
  // 150 + 92,40 + 120 (partiel) + 19,95 + 68,90 + 0 (en attente) + 23,60 + 24 + 145
  assert.equal(eur(x.depenses.totals), 64_385)
  assert.equal(eur(x.depenses.reste), 6_000 + 999)
  assert.equal(eur(x.recues.totals), 41_694)
  assert.equal(eur(x.tiers.totals), 3_990 + 6_000 + 1_260)
  // Totaux par catégorie : uniquement mes dépenses, somme = total des dépenses.
  assert.equal(x.byCategory.reduce((n, c) => n + eur(c.totals), 0), eur(x.depenses.totals))
  assert.equal(x.byCategory.reduce((n, c) => n + c.count, 0), x.depenses.items.length)
  // Pension versée = sous-ensemble déjà compté dans les dépenses.
  assert.equal(eur(x.pensionVersee), 15_000)
  assert.deepEqual(x.pensionRecue, [])
})

test('liste vide : aucun total', () => {
  const x = summarizeExpenses([])
  assert.deepEqual([x.depenses.items, x.depenses.totals, x.recues.totals, x.tiers.totals, x.byCategory], [[], [], [], [], []])
})

test('libellés de ligne : sens, payeur, montant réglé et reste dû', () => {
  const byId = new Map(demo().map((e) => [e.id, e]))
  assert.equal(expenseParties(byId.get('jd_f_3')!.depense), 'Dépense payée · payé par L’autre parent')
  assert.equal(expenseParties(byId.get('jd_f_2')!.depense), 'Dépense payée · payé par Moi') // payeur non précisé
  assert.equal(expenseParties(byId.get('jd_ex_caf')!.depense), 'Paiement reçu · payé par Organisme : CAF de Guyane')
  const nounou = expenseAmount(byId.get('jd_ex_nounou')!.depense)
  assert.equal(nb(nounou.regle), '120,00 €')
  assert.equal(nb(nounou.detail ?? ''), 'sur 180,00 €, dont 60,00 € à régler')
  assert.equal(expenseAmount(byId.get('jd_f_2')!.depense).detail, null)
})
