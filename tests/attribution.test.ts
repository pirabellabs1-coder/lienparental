/** Attribution des inscriptions (UTM) : lecture des paramètres, nettoyage, premier / dernier contact. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanValue, mergeAttribution, parseAttribution, serializeAttribution, touchFromUrl } from '../lib/attribution/core'

const NOW = 1_800_000_000_000

test('arrivée avec UTM : contact complet, page sans paramètres, référent externe', () => {
  const url = new URL('https://lienparental.fr/guide/garde?utm_source=tiktok&utm_medium=organic&utm_campaign=LP_W45_depenses&utm_content=MD-2026-W45-01&fbclid=XYZ')
  const t = touchFromUrl(url, 'https://www.tiktok.com/@lienparental', NOW)
  assert.deepEqual(t, { s: 'tiktok', m: 'organic', c: 'LP_W45_depenses', t: 'MD-2026-W45-01', p: '/guide/garde', r: 'www.tiktok.com', at: 1_800_000_000 })
})

test('sans utm_source : aucune attribution ; référent interne ignoré', () => {
  assert.equal(touchFromUrl(new URL('https://lienparental.fr/?utm_campaign=x'), null, NOW), null)
  const t = touchFromUrl(new URL('https://lienparental.fr/?utm_source=facebook'), 'https://lienparental.fr/blog', NOW)
  assert.equal(t?.r, undefined)
})

test('valeurs nettoyées et bornées (pas de HTML, 100 caractères)', () => {
  assert.equal(cleanValue('<script>alert(1)</script>'), 'scriptalert1/script')
  assert.equal(cleanValue('a'.repeat(150))?.length, 100)
  assert.equal(cleanValue('   '), undefined)
})

test('premier contact conservé, dernier remplacé ; cookie falsifié refusé', () => {
  const a = touchFromUrl(new URL('https://lienparental.fr/?utm_source=tiktok'), null, NOW)!
  const b = touchFromUrl(new URL('https://lienparental.fr/?utm_source=google&utm_medium=paid'), null, NOW + 1000)!
  const merged = mergeAttribution(mergeAttribution(null, a), b)
  assert.equal(merged.f.s, 'tiktok')
  assert.equal(merged.l.s, 'google')
  assert.deepEqual(parseAttribution(serializeAttribution(merged)), merged)
  assert.equal(parseAttribution('{"f":{"s":1},"l":{}}'), null)
  assert.equal(parseAttribution('pas du json'), null)
  assert.equal(parseAttribution(undefined), null)
})
