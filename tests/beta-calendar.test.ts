/** Bêta-test : heures du calendrier au format de la langue (fr « 11h15 », en « 11:15 AM », pt « 11:15 »). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtHourLocale, fmtHourTickLocale, fmtWallTime } from '../lib/calendrier'

test('fmtWallTime : français conserve la notation « 11h15 » / « 8h »', () => {
  assert.equal(fmtWallTime('11:15', 'fr'), '11h15')
  assert.equal(fmtWallTime('08:00', 'fr'), '8h')
})

test('fmtWallTime : portugais au format brésilien 24 h, sans « h »', () => {
  assert.equal(fmtWallTime('11:15', 'pt'), '11:15')
  assert.equal(fmtWallTime('08:05', 'pt'), '08:05')
  assert.equal(fmtWallTime('18:00', 'pt'), '18:00')
})

test('fmtWallTime : anglais en 12 h AM/PM', () => {
  assert.match(fmtWallTime('11:15', 'en'), /^11:15\sAM$/)
  assert.match(fmtWallTime('14:30', 'en'), /^2:30\sPM$/)
})

test('fmtHourLocale lit l’heure murale de Cayenne, pas celle de la machine', () => {
  // 14:15 UTC = 11:15 à Cayenne (UTC-3).
  assert.equal(fmtHourLocale('2026-10-27T14:15:00.000Z', 'pt'), '11:15')
  assert.equal(fmtHourLocale('2026-10-27T14:15:00.000Z', 'fr'), '11h15')
})

test('graduations de la grille horaire', () => {
  assert.equal(fmtHourTickLocale(8, 'fr'), '08h')
  assert.equal(fmtHourTickLocale(8, 'pt'), '08:00')
  assert.match(fmtHourTickLocale(14, 'en'), /^2\sPM$/)
})
