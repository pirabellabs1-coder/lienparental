/** lib/tz : règle unique « un instant se lit dans DEFAULT_TZ » (America/Cayenne, UTC−3). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TZ, addDaysToKey, dayKeyInTz, fmtDayKey, monthKeyInTz, timeInTz, todayKey, wallTimeToIso } from '../lib/tz'
import { dayKey, dayLabel, fullStamp, shortStamp, timeLabel } from '../components/messages/format'

// 23 h 30 le 31 octobre à Cayenne = 02 h 30 UTC le 1er novembre.
const LATE = '2026-11-01T02:30:00.000Z'

test('fuseau de référence', () => {
  assert.equal(DEFAULT_TZ, 'America/Cayenne')
})

test('23 h 30 à Cayenne reste le jour et le mois locaux (pas le jour UTC)', () => {
  assert.equal(dayKeyInTz(LATE), '2026-10-31')
  assert.equal(timeInTz(LATE), '23:30')
  assert.equal(monthKeyInTz(LATE), '2026-10')
  assert.equal(todayKey(DEFAULT_TZ, new Date(LATE)), '2026-10-31')
  // Même instant lu en UTC : autre jour (preuve que le fuseau est bien appliqué).
  assert.equal(dayKeyInTz(LATE, 'UTC'), '2026-11-01')
})

test('heure murale vers instant, aller-retour', () => {
  assert.equal(wallTimeToIso('2026-10-31', '23:30'), LATE)
  assert.equal(wallTimeToIso('2026-10-31', '00:00'), '2026-10-31T03:00:00.000Z')
  const iso = wallTimeToIso('2026-02-28', '23:59')
  assert.equal(dayKeyInTz(iso), '2026-02-28')
  assert.equal(timeInTz(iso), '23:59')
})

test('jours « seuls » : pas de glissement', () => {
  assert.equal(dayKeyInTz('2026-10-31'), '2026-10-31')
  assert.equal(timeInTz('2026-10-31'), '')
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysToKey('2024-03-01', -1), '2024-02-29')
  assert.equal(fmtDayKey('2026-10-31', { day: 'numeric', month: 'long', year: 'numeric' }), '31 octobre 2026')
})

test('messagerie : heures et jours en DEFAULT_TZ', () => {
  assert.equal(timeLabel(LATE), '23:30')
  assert.equal(dayKey(LATE), '2026-10-31')
  assert.equal(fullStamp(LATE), '31 octobre 2026 à 23:30')
  // « Maintenant » = 1er nov. 10 h à Cayenne : le message de 23 h 30 la veille est « Hier ».
  const now = new Date('2026-11-01T13:00:00.000Z')
  assert.equal(dayLabel(LATE, now), 'Hier')
  assert.equal(shortStamp(LATE, now), 'Hier')
  // 23 h 45 le 31 à Cayenne : même jour local, alors que le jour UTC a déjà changé.
  const sameNight = new Date('2026-11-01T02:45:00.000Z')
  assert.equal(dayLabel(LATE, sameNight), "Aujourd'hui")
  assert.equal(shortStamp(LATE, sameNight), '23:30')
  assert.equal(dayLabel('2026-10-20T15:00:00.000Z', now), 'Mardi 20 octobre')
  assert.equal(dayLabel('2025-10-20T15:00:00.000Z', now), 'Lundi 20 octobre 2025')
  assert.equal(shortStamp('2026-10-20T15:00:00.000Z', now), '20 oct.')
})
