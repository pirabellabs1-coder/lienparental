/**
 * lib/recurrence.ts : règles RRULE (lecture / écriture), occurrences en heure murale du fuseau
 * de la série (Guyane, Paris avec heure d'été), fin de série, vacances scolaires.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandSeries, formatRule, parseRule, seriesEnd, truncateBefore, untilEndOfDay, type RRule, type Series } from '../lib/recurrence'
import { dayKeyInTz, timeInTz } from '../lib/tz'

const CAY = 'America/Cayenne'
const PAR = 'Europe/Paris'
const rule = (s: string) => parseRule(s)!
const days = (occ: { start: string }[], tz = CAY) => occ.map((o) => dayKeyInTz(o.start, tz))

test('règle : lecture et écriture RFC 5545 (aller-retour), refus des règles invalides', () => {
  for (const s of ['FREQ=DAILY', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10', 'FREQ=MONTHLY;BYDAY=-1FR', 'FREQ=MONTHLY;BYMONTHDAY=15', 'FREQ=YEARLY;UNTIL=20301231T235959Z', 'X-LP-HOLIDAYS=1;ZONE=guyane;PART=FIRST;YEARS=EVEN']) {
    assert.equal(formatRule(rule(s)), s)
  }
  assert.equal(parseRule('RRULE:FREQ=DAILY;INTERVAL=1')?.kind, 'rrule')
  for (const bad of ['', 'FREQ=HOURLY', 'FREQ=DAILY;INTERVAL=0', 'FREQ=DAILY;COUNT=3;UNTIL=20300101', 'FREQ=WEEKLY;BYDAY=XX', 'FREQ=DAILY;COUNT=5000', 'X-LP-HOLIDAYS=1;ZONE=lune']) {
    assert.equal(parseRule(bad), null, bad)
  }
})

test('appel vidéo tous les jours à 18h (Guyane) : 18h heure de Guyane, changements de mois et d’année', () => {
  const s: Series = { start: '2026-12-30T21:00:00.000Z', end: '2026-12-30T21:30:00.000Z', tz: CAY, rule: rule('FREQ=DAILY') }
  const occ = expandSeries(s, '2026-12-29T00:00:00.000Z', '2027-01-03T03:00:00.000Z')
  assert.deepEqual(days(occ), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  assert.ok(occ.every((o) => timeInTz(o.start, CAY) === '18:00' && timeInTz(o.end, CAY) === '18:30'))
  // Période lointaine : calculée sans parcourir toute la série, toujours à 18h.
  const later = expandSeries(s, '2028-03-01T03:00:00.000Z', '2028-03-03T03:00:00.000Z')
  assert.deepEqual(days(later), ['2028-03-01', '2028-03-02'])
})

test('heure d’été (Paris) : une série à 18h reste à 18h heure de Paris', () => {
  const s: Series = { start: '2027-03-26T17:00:00.000Z', end: '2027-03-26T18:00:00.000Z', tz: PAR, rule: rule('FREQ=DAILY;COUNT=4') }
  const occ = expandSeries(s, '2027-03-01T00:00:00.000Z', '2027-04-30T00:00:00.000Z')
  assert.equal(occ.length, 4)
  assert.ok(occ.every((o) => timeInTz(o.start, PAR) === '18:00'))
  assert.equal(occ[3].start, '2027-03-29T16:00:00.000Z') // UTC+2 après le 28 mars
})

test('plusieurs jours par semaine, et fin « après 5 fois »', () => {
  const s: Series = { start: '2026-11-02T20:00:00.000Z', end: '2026-11-02T21:00:00.000Z', tz: CAY, rule: rule('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5') }
  const occ = expandSeries(s, '2026-11-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z')
  assert.deepEqual(days(occ), ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11'])
  assert.equal(seriesEnd(s), occ[4].end)
})

test('droit de visite : vendredi 18h → dimanche 18h, un week-end sur deux', () => {
  const s: Series = { start: '2026-11-06T21:00:00.000Z', end: '2026-11-08T21:00:00.000Z', tz: CAY, rule: rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR') }
  const occ = expandSeries(s, '2026-11-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z')
  assert.deepEqual(days(occ), ['2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18'])
  assert.ok(occ.every((o) => dayKeyInTz(o.end, CAY) > dayKeyInTz(o.start, CAY) && timeInTz(o.end, CAY) === '18:00'))
  // Week-end commencé avant la période affichée : présent (il la chevauche).
  assert.deepEqual(days(expandSeries(s, '2026-11-21T12:00:00.000Z', '2026-11-23T00:00:00.000Z')), ['2026-11-20'])
})

test('mensuel et annuel : 31 du mois ignoré quand il n’existe pas, dernier vendredi, 29 février', () => {
  const m: Series = { start: '2027-01-31T13:00:00.000Z', end: '2027-01-31T14:00:00.000Z', tz: CAY, rule: rule('FREQ=MONTHLY') }
  assert.deepEqual(days(expandSeries(m, '2027-01-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z')), ['2027-01-31', '2027-03-31', '2027-05-31'])
  const last: Series = { start: '2026-11-27T13:00:00.000Z', end: '2026-11-27T14:00:00.000Z', tz: CAY, rule: rule('FREQ=MONTHLY;BYDAY=-1FR') }
  assert.deepEqual(days(expandSeries(last, '2026-11-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z')), ['2026-11-27', '2026-12-25', '2027-01-29', '2027-02-26'])
  const leap: Series = { start: '2028-02-29T13:00:00.000Z', end: '2028-02-29T14:00:00.000Z', tz: CAY, rule: rule('FREQ=YEARLY') }
  assert.deepEqual(days(expandSeries(leap, '2028-01-01T00:00:00.000Z', '2033-01-01T00:00:00.000Z')), ['2028-02-29', '2032-02-29'])
})

test('fin à une date précise (incluse) et « cet événement et les suivants »', () => {
  const until = untilEndOfDay('2026-11-05', CAY)
  const s: Series = { start: '2026-11-01T21:00:00.000Z', end: '2026-11-01T21:30:00.000Z', tz: CAY, rule: { ...(rule('FREQ=DAILY') as RRule), until } }
  assert.deepEqual(days(expandSeries(s, '2026-10-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  const cut = { ...s, rule: truncateBefore(s.rule as RRule, '2026-11-03T21:00:00.000Z') }
  assert.deepEqual(days(expandSeries(cut, '2026-10-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')), ['2026-11-01', '2026-11-02'])
  assert.equal(seriesEnd({ ...s, rule: rule('FREQ=DAILY') }), null)
  assert.equal(seriesEnd({ ...s, rule: rule('X-LP-HOLIDAYS=1;ZONE=guyane;PART=ALL;YEARS=ALL') }), null)
  assert.equal(parseRule('FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=31'), null)
})

test('vacances scolaires (Guyane) : périodes entières, moitiés, années paires ou impaires', () => {
  const base = { start: '2026-09-01T12:00:00.000Z', end: '2026-09-01T12:00:00.000Z', tz: CAY }
  const all = expandSeries({ ...base, rule: rule('X-LP-HOLIDAYS=1;ZONE=guyane;PART=ALL;YEARS=ALL') }, '2026-09-01T00:00:00.000Z', '2027-09-01T00:00:00.000Z')
  assert.ok(all.length >= 4)
  assert.equal(days([all[0]])[0], '2026-10-17')
  const first = expandSeries({ ...base, rule: rule('X-LP-HOLIDAYS=1;ZONE=guyane;PART=FIRST;YEARS=ALL') }, '2026-09-01T00:00:00.000Z', '2027-09-01T00:00:00.000Z')
  assert.ok(Date.parse(first[0].end) < Date.parse(all[0].end))
  const even = expandSeries({ ...base, rule: rule('X-LP-HOLIDAYS=1;ZONE=guyane;PART=ALL;YEARS=EVEN') }, '2026-09-01T00:00:00.000Z', '2027-09-01T00:00:00.000Z')
  assert.ok(even.length > 0 && even.every((o) => dayKeyInTz(o.start, CAY).startsWith('2026')))
})

test('formulaire : choix rapides, jours, mensuel « 2e mardi », fin, aller-retour d’édition', async () => {
  const { DEFAULT_RECURRENCE: D, buildRule, stateFromRule } = await import('../lib/recurrence-form')
  assert.equal(buildRule(D, '2026-11-10', CAY), null)
  assert.equal(buildRule({ ...D, preset: 'daily' }, '2026-11-10', CAY), 'FREQ=DAILY')
  assert.equal(buildRule({ ...D, preset: 'weekly' }, '2026-11-10', CAY), 'FREQ=WEEKLY;BYDAY=TU')
  assert.equal(buildRule({ ...D, preset: 'biweekly', days: ['FR', 'MO'] }, '2026-11-10', CAY), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR')
  assert.equal(buildRule({ ...D, preset: 'monthly', monthly: 'nth' }, '2026-11-10', CAY), 'FREQ=MONTHLY;BYDAY=2TU')
  assert.equal(buildRule({ ...D, preset: 'monthly', monthly: 'nth' }, '2026-11-30', CAY), 'FREQ=MONTHLY;BYDAY=-1MO')
  assert.equal(buildRule({ ...D, preset: 'custom', interval: 3, unit: 'DAILY', end: 'count', count: 6 }, '2026-11-10', CAY), 'FREQ=DAILY;INTERVAL=3;COUNT=6')
  const until = buildRule({ ...D, preset: 'daily', end: 'until', untilDate: '2026-12-31' }, '2026-11-10', CAY)!
  assert.equal(until, 'FREQ=DAILY;UNTIL=20270101T025959Z') // 31/12 23:59:59 à Cayenne
  assert.equal(stateFromRule(until, CAY).untilDate, '2026-12-31')
  assert.equal(buildRule({ ...D, preset: 'holidays', zone: 'A', part: 'SECOND', years: 'ODD', end: 'count' }, '2026-11-10', CAY), 'X-LP-HOLIDAYS=1;ZONE=A;PART=SECOND;YEARS=ODD')
  const back = stateFromRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=8', CAY)
  assert.equal(back.preset, 'biweekly'); assert.deepEqual(back.days, ['FR']); assert.equal(back.end, 'count')
  // « Et les suivantes » à la 4e séance d'une série de 8 : il en reste 5.
  const opts = { seriesStart: '2026-11-06T21:00:00.000Z', seriesEnd: '2026-11-06T22:00:00.000Z', occurrence: '2026-12-18T21:00:00.000Z' }
  const rest = stateFromRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=8', CAY, opts)
  assert.equal(rest.end, 'count'); assert.equal(rest.count, 5)
  // Série coupée juste avant le 20/11 : fin affichée au 6/11, et règle inchangée si l'on n'y touche pas.
  const cut = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;UNTIL=20261120T205959Z'
  const st = stateFromRule(cut, CAY, opts)
  assert.equal(st.untilDate, '2026-11-06')
  assert.equal(buildRule(st, '2026-11-06', CAY), cut)
  assert.equal(stateFromRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=8', CAY).count, 8)
})

test('rappels des séries : occurrence échue, supprimée, déplacée (nouveau rappel), annulée', async () => {
  const { dueOccurrences } = await import('../lib/notify/recurring')
  const t = { event_id: 'e1', user_id: 'u1', mins: 15, start_at: '2026-11-01T21:00:00.000Z', end_at: '2026-11-01T21:30:00.000Z', rrule: 'FREQ=DAILY', tzid: CAY }
  const at = (iso: string) => new Date(iso)
  // 17h50 à Cayenne le 5 novembre : rappel de 18h dû ; 17h40 : pas encore.
  assert.deepEqual(dueOccurrences(t, [], at('2026-11-05T20:50:00.000Z')), [{ occurrence: '2026-11-05T21:00:00.000Z', start: '2026-11-05T21:00:00.000Z' }])
  assert.equal(dueOccurrences(t, [], at('2026-11-05T20:40:00.000Z')).length, 0)
  const key = '2026-11-05T21:00:00.000Z'
  assert.equal(dueOccurrences(t, [{ occurrence: key, deleted: true }], at('2026-11-05T20:50:00.000Z')).length, 0)
  assert.equal(dueOccurrences(t, [{ occurrence: key, deleted: false, status: 'annule' }], at('2026-11-05T20:50:00.000Z')).length, 0)
  const moved = [{ occurrence: key, deleted: false, start: '2026-11-05T22:00:00.000Z', end: '2026-11-05T22:30:00.000Z' }]
  assert.equal(dueOccurrences(t, moved, at('2026-11-05T20:50:00.000Z')).length, 0)
  assert.deepEqual(dueOccurrences(t, moved, at('2026-11-05T21:50:00.000Z')), [{ occurrence: key, start: '2026-11-05T22:00:00.000Z' }])
})
