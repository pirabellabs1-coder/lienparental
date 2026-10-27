/** Séries du tableau de bord admin (0450) : regroupements, résiliation, cohortes, appareils, mini-courbes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachSparklines,
  bucketRows,
  churnRates,
  cohortGrid,
  deviceShares,
  lineGrain,
  mrrSeries,
  SPARK_POINTS,
} from '../lib/admin/stats/trends'
import { bucketKey } from '../lib/admin/stats/compute'
import type { Kpi, Trends } from '../lib/admin/stats/types'

// Du samedi 29 février au mardi 10 mars 2020.
const days = ['2020-02-29', '2020-03-01', '2020-03-02', '2020-03-03', '2020-03-04', '2020-03-05', '2020-03-06', '2020-03-07', '2020-03-08', '2020-03-09', '2020-03-10']
const rows = days.map((day, i) => ({ day, flow: i + 1, stock: 100 + i }))

test('bucketKey : jour, lundi de la semaine ISO, mois', () => {
  assert.equal(bucketKey('2020-03-08', 'jour'), '2020-03-08')
  assert.equal(bucketKey('2020-03-08', 'semaine'), '2020-03-02') // dimanche → lundi précédent
  assert.equal(bucketKey('2020-03-02', 'semaine'), '2020-03-02')
  assert.equal(bucketKey('2020-03-01', 'semaine'), '2020-02-24')
  assert.equal(bucketKey('2020-03-08', 'mois'), '2020-03')
})

test('bucketRows par semaine : somme des flux, dernière valeur des stocks, moyenne', () => {
  const b = bucketRows(rows, 'semaine', { flow: 'sum', stock: 'last' })
  assert.deepEqual(b.map((x) => x.key), ['2020-02-24', '2020-03-02', '2020-03-09'])
  assert.deepEqual(b.map((x) => x.days), [2, 7, 2])
  assert.deepEqual(b.map((x) => x.values.flow), [1 + 2, 3 + 4 + 5 + 6 + 7 + 8 + 9, 10 + 11])
  assert.deepEqual(b.map((x) => x.values.stock), [101, 108, 110])
  const avg = bucketRows(rows, 'semaine', { flow: 'avg' })
  assert.deepEqual(avg.map((x) => x.values.flow), [1.5, 6, 10.5])
  assert.match(b[1].longLabel, /^Semaine du 2 mars 2020$/)
})

test('bucketRows : ordre chronologique même si l’entrée est désordonnée ; mois', () => {
  const b = bucketRows([...rows].reverse(), 'mois', { flow: 'sum', stock: 'last' })
  assert.deepEqual(b.map((x) => [x.key, x.values.flow, x.values.stock]), [['2020-02', 1, 100], ['2020-03', 65, 110]])
  assert.deepEqual(bucketRows([], 'jour', { flow: 'sum' }), [])
})

test('lineGrain : quotidien jusqu’à 120 jours, hebdomadaire au-delà', () => {
  assert.equal(lineGrain(7), 'jour')
  assert.equal(lineGrain(120), 'jour')
  assert.equal(lineGrain(121), 'semaine')
  assert.equal(lineGrain(365), 'semaine')
})

test('churnRates : résiliations / abonnés au début (fin − nouveaux + résiliations)', () => {
  // Début = 10 − 2 + 3 = 11 → 3 / 11.
  assert.deepEqual(churnRates([{ total: 10, started: 2, canceled: 3 }]), [27.27])
  assert.deepEqual(churnRates([{ total: 5, started: 5, canceled: 0 }]), [null]) // aucun abonné au début
  assert.deepEqual(churnRates([{ total: 0, started: 0, canceled: 0 }, { total: 4, started: 0, canceled: 0 }]), [null, 0])
})

test('cohortGrid : pourcentages, semaine en cours partielle exclue de la moyenne', () => {
  const g = cohortGrid({
    currentWeek: '2020-03-16',
    cohorts: [
      { week: '2020-03-09', size: 4, active: [4, 1] },
      { week: '2020-03-02', size: 10, active: [8, 5, 3] },
      { week: '2020-03-16', size: 0, active: [0] },
    ],
  })
  assert.equal(g.columns, 3)
  assert.deepEqual(g.rows.map((r) => r.week), ['2020-03-02', '2020-03-09', '2020-03-16'])
  assert.deepEqual(g.rows[0].cells.map((c) => [c.pct, c.partial]), [[80, false], [50, false], [30, true]])
  assert.deepEqual(g.rows[1].cells.map((c) => c.partial), [false, true])
  assert.equal(g.rows[2].cells[0].pct, null) // cohorte vide
  // S0 : (8 + 4) / 14 ; S1 : seule la cohorte du 2 mars est complète → 5 / 10 ; S2 : partielle partout.
  assert.deepEqual(g.average, [85.71, 50, null])
})

test('cohortGrid : dernière semaine complète (dernier jour = dimanche) comptée dans la moyenne', () => {
  const g = cohortGrid({ currentWeek: '2020-03-09', lastDay: '2020-03-15', cohorts: [{ week: '2020-03-02', size: 10, active: [8, 4] }] })
  assert.deepEqual(g.rows[0].cells.map((c) => c.partial), [false, false])
  assert.deepEqual(g.average, [80, 40])
  const partial = cohortGrid({ currentWeek: '2020-03-09', lastDay: '2020-03-14', cohorts: [{ week: '2020-03-02', size: 10, active: [8, 4] }] })
  assert.deepEqual(partial.average, [80, null])
})

test('cohortGrid : actifs plafonnés à la taille de la cohorte ; grille vide', () => {
  const g = cohortGrid({ currentWeek: '2020-03-09', cohorts: [{ week: '2020-03-02', size: 2, active: [3, 0] }] })
  assert.equal(g.rows[0].cells[0].pct, 100)
  assert.deepEqual(cohortGrid({ currentWeek: '2020-03-09', cohorts: [] }), { columns: 0, rows: [], average: [] })
})

test('deviceShares : parts sur le total ; « non identifié » masqué s’il est nul', () => {
  const s = deviceShares({ mobile: 6, ordinateur: 3, tablette: 1, inconnu: 0 })
  assert.equal(s.total, 10)
  assert.deepEqual(s.rows.map((r) => [r.key, r.pct]), [['mobile', 60], ['ordinateur', 30], ['tablette', 10]])
  const z = deviceShares({ mobile: 0, ordinateur: 0, tablette: 0, inconnu: 0 })
  assert.equal(z.total, 0)
  assert.ok(z.rows.every((r) => r.pct === 0))
  assert.equal(deviceShares({ mobile: 1, ordinateur: 0, tablette: 0, inconnu: 1 }).rows.length, 4)
})

const pricing = { monthlyEur: 10, yearlyEur: 120, coparentaliteMonthlyEur: 20, coparentaliteYearlyEur: 240, aiCostPerAnalysisEur: 0.07 }

test('mrrSeries : même formule que l’indicateur MRR', () => {
  const m = mrrSeries([{ day: '2020-03-02', premiumMonthly: 2, premiumYearly: 1, coparentaliteMonthly: 1, coparentaliteYearly: 1 }], pricing)
  assert.deepEqual(m, [{ day: '2020-03-02', value: 2 * 10 + 120 / 12 + 20 + 240 / 12 }])
})

test('attachSparklines : seulement les indicateurs qui ont une série, 12 derniers points au plus', () => {
  const kpi = (id: string): Kpi => ({ id, group: 'audience', label: id, value: 1, previous: 0, unit: 'count', tone: 'night' })
  const span = Array.from({ length: 20 }, (_, i) => `2020-03-${String(i + 1).padStart(2, '0')}`)
  const trends: Trends = {
    activeDaily: span.map((day, i) => ({ day, dau: i, wau: i * 2 })),
    activePrevDaily: [],
    accountsDaily: span.map((day, i) => ({ day, value: 100 + i })),
    subsDaily: span.map((day) => ({ day, premiumMonthly: 1, premiumYearly: 0, coparentaliteMonthly: 0, coparentaliteYearly: 0 })),
    mrrDaily: span.map((day) => ({ day, value: 10 })),
    subsFlowDaily: span.map((day) => ({ day, started: 1, canceled: 0 })),
    activityDaily: span.map((day) => ({ day, messages: 1, ai: 2, documents: 3 })),
    devices: { current: { mobile: 0, ordinateur: 0, tablette: 0, inconnu: 0 }, previous: { mobile: 0, ordinateur: 0, tablette: 0, inconnu: 0 }, pwaMeasured: false },
  }
  const out = attachSparklines([kpi('inscrits'), kpi('actifs7'), kpi('conversion'), kpi('coach'), kpi('nouveaux')], {
    trends,
    // Série creuse comme celle de la base : les jours sans inscription sont complétés à 0.
    signupsDaily: [{ day: '2020-03-15', value: 3 }, { day: '2020-03-19', value: 2 }],
    revenueMonthly: [],
    grain: 'jour',
    fromDay: '2020-03-01',
    toDay: '2020-03-20',
  })
  const by = Object.fromEntries(out.map((k) => [k.id, k.spark]))
  assert.equal(by.inscrits?.length, SPARK_POINTS)
  assert.deepEqual(by.inscrits?.slice(-2), [118, 119])
  // « Actifs (7 j) » compte aussi les connexions : pas de mini-courbe tirée d'une série qui ne les compte pas.
  assert.equal(by.actifs7, undefined)
  assert.equal(by.conversion, undefined)
  assert.deepEqual(by.nouveaux, [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0])
  assert.deepEqual(by.coach?.slice(-1), [2])
  // Sans séries 0450 : aucune mini-courbe inventée.
  const none = attachSparklines([kpi('inscrits')], { trends: null, signupsDaily: [], revenueMonthly: [], grain: 'jour', fromDay: '2020-03-01', toDay: '2020-03-20' })
  assert.equal(none[0].spark, undefined)
})
