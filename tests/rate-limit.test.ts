/** lib/data/server/rate-limit-core : extraction d'IP, clés pseudonymisées, fenêtres, repli mémoire. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.IP_HASH_SALT = 'test-salt-rate-limit'

import {
  MemoryLimiter, clientIp, ipBucket, ipKey, normalizeIp, retryAfterSeconds, storageKey, tokenKey, userKey,
  windowSeconds, windowStartMs,
} from '../lib/data/server/rate-limit-core'

const h = (init: Record<string, string>) => new Headers(init)

// --- clientIp ----------------------------------------------------------------

test('clientIp : x-vercel-forwarded-for est prioritaire', () => {
  assert.equal(clientIp(h({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '1.1.1.1, 198.51.100.2' })), '203.0.113.7')
})

test('clientIp : puis x-real-ip', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '1.1.1.1, 198.51.100.2' })), '198.51.100.1')
})

test('clientIp : puis le DERNIER saut de x-forwarded-for (le premier est falsifiable)', () => {
  assert.equal(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1, 198.51.100.2' })), '198.51.100.2')
  assert.equal(clientIp(h({ 'x-forwarded-for': '198.51.100.2' })), '198.51.100.2')
  assert.equal(clientIp(h({ 'x-forwarded-for': '6.6.6.6,  198.51.100.2 ,' })), '198.51.100.2')
})

test('clientIp : valeurs invalides ignorées, repli sur la source suivante puis « unknown »', () => {
  assert.equal(clientIp(h({ 'x-vercel-forwarded-for': 'pas une ip', 'x-real-ip': '198.51.100.1' })), '198.51.100.1')
  assert.equal(clientIp(h({ 'x-real-ip': '<script>' })), 'unknown')
  assert.equal(clientIp(h({ 'x-forwarded-for': '999.1' })), 'unknown')
  assert.equal(clientIp(h({})), 'unknown')
})

test('normalizeIp : ports, crochets, casse, IPv4 mappée', () => {
  assert.equal(normalizeIp('198.51.100.2:51234'), '198.51.100.2')
  assert.equal(normalizeIp('[2001:DB8::1]:443'), '2001:db8::1')
  assert.equal(normalizeIp('::ffff:198.51.100.2'), '198.51.100.2')
  assert.equal(normalizeIp(' 2001:db8::1 '), '2001:db8::1')
  assert.equal(normalizeIp('abc'), null)
  assert.equal(normalizeIp('1.2.3'), null)
  assert.equal(normalizeIp(''), null)
  assert.equal(normalizeIp(null), null)
  assert.equal(normalizeIp('a'.repeat(60)), null)
})

// --- ipBucket ------------------------------------------------------------------

test('ipBucket : IPv4 inchangée, IPv6 ramenée au /64', () => {
  assert.equal(ipBucket('198.51.100.2'), '198.51.100.2')
  assert.equal(ipBucket('unknown'), 'unknown')
  assert.equal(ipBucket('2001:db8:aa:bb:1:2:3:4'), '2001:db8:aa:bb::/64')
  assert.equal(ipBucket('2001:0db8:00aa:00bb::ffff'), '2001:db8:aa:bb::/64')
  assert.equal(ipBucket('2001:db8::1'), '2001:db8:0:0::/64')
  assert.equal(ipBucket('::1'), '0:0:0:0::/64')
})

// --- Clés ----------------------------------------------------------------------

test('ipKey : jamais l’IP en clair, déterministe, même compteur pour un même /64', () => {
  const k = ipKey('temoin:read', '198.51.100.2')
  assert.match(k, /^temoin:read:ip:[0-9a-f]{32}$/)
  assert.ok(!k.includes('198.51.100.2'))
  assert.equal(k, ipKey('temoin:read', '198.51.100.2'))
  assert.notEqual(k, ipKey('temoin:read', '198.51.100.3'))
  assert.notEqual(k, ipKey('temoin:write', '198.51.100.2'))
  assert.equal(ipKey('a', '2001:db8:aa:bb:1:2:3:4'), ipKey('a', '2001:db8:aa:bb:ffff::9'))
  assert.notEqual(ipKey('a', '2001:db8:aa:bb::1'), ipKey('a', '2001:db8:aa:bc::1'))
})

test('ipKey : l’empreinte dépend du sel (IP_HASH_SALT)', () => {
  const before = ipKey('x', '198.51.100.2')
  const saved = process.env.IP_HASH_SALT
  process.env.IP_HASH_SALT = 'autre-sel'
  try {
    assert.notEqual(ipKey('x', '198.51.100.2'), before)
  } finally {
    process.env.IP_HASH_SALT = saved
  }
  assert.equal(ipKey('x', '198.51.100.2'), before)
})

test('tokenKey : jeton haché, userKey : identifiant en clair', () => {
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
  const k = tokenKey('temoin:write-token', token)
  assert.match(k, /^temoin:write-token:t:[0-9a-f]{32}$/)
  assert.ok(!k.includes(token))
  assert.equal(userKey('coach-chat', '7d3f0c2e-1111-4222-8333-944455556666'), 'coach-chat:u:7d3f0c2e-1111-4222-8333-944455556666')
})

test('action invalide refusée (pas d’injection de séparateurs ni de données)', () => {
  assert.throws(() => ipKey('Temoin read', '1.2.3.4'))
  assert.throws(() => userKey('', 'u'))
  assert.throws(() => tokenKey('a'.repeat(80), 't'))
})

test('storageKey : famille en clair + empreinte, rien de la clé brute', () => {
  const raw = 'legacy:198.51.100.2:secret-token'
  const s = storageKey(raw)
  assert.match(s, /^legacy:[0-9a-f]{32}$/)
  assert.ok(!s.includes('198.51.100.2') && !s.includes('secret-token'))
  assert.equal(s, storageKey(raw))
  assert.notEqual(s, storageKey('legacy:198.51.100.3:secret-token'))
  assert.match(storageKey('<>:x'), /^k:[0-9a-f]{32}$/)
  assert.ok(storageKey(`${'z'.repeat(300)}:x`).length <= 200)
})

// --- Fenêtres (même calcul que rate_limit_hit en SQL) ---------------------------

test('fenêtres fixes alignées sur l’epoch', () => {
  assert.equal(windowSeconds(60_000), 60)
  assert.equal(windowSeconds(1), 1)
  assert.equal(windowSeconds(0), 1)
  assert.equal(windowSeconds(10 * 86_400_000), 86_400)
  const t = Date.UTC(2026, 9, 26, 10, 7, 30, 250)
  assert.equal(windowStartMs(t, 60), Date.UTC(2026, 9, 26, 10, 7, 0))
  assert.equal(windowStartMs(t, 900), Date.UTC(2026, 9, 26, 10, 0, 0))
  assert.equal(retryAfterSeconds(t, 60), 30)
  assert.equal(retryAfterSeconds(Date.UTC(2026, 9, 26, 10, 7, 59, 999), 60), 1)
  assert.equal(retryAfterSeconds(Date.UTC(2026, 9, 26, 10, 0, 0), 900), 900)
})

// --- Repli mémoire ------------------------------------------------------------------

test('MemoryLimiter : autorise jusqu’à la limite puis refuse avec Retry-After', () => {
  const m = new MemoryLimiter()
  const t0 = 1_000_000
  for (let i = 0; i < 3; i++) assert.deepEqual(m.hit('k', 3, 60_000, t0 + i), { ok: true })
  const r = m.hit('k', 3, 60_000, t0 + 10_000)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.reason === 'limited' && r.retryAfter === 50)
  assert.deepEqual(m.hit('autre', 3, 60_000, t0 + 10_000), { ok: true })
  // Nouvelle fenêtre.
  assert.deepEqual(m.hit('k', 3, 60_000, t0 + 60_000), { ok: true })
})

test('MemoryLimiter : limite 0 refuse tout, taille bornée', () => {
  const z = new MemoryLimiter()
  assert.equal(z.hit('k', 0, 1_000, 0).ok, false)
  const m = new MemoryLimiter(5)
  for (let i = 0; i < 20; i++) m.hit(`k${i}`, 10, 60_000, 0)
  assert.ok(m.size <= 5)
})
