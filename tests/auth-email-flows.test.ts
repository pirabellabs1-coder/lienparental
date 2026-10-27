/**
 * lib/auth/email-flows : validation, réponses neutres et en temps constant (anti-énumération), limites
 * de débit (dont plafond quotidien par adresse), pré-détournement de compte impossible, aucun texte
 * saisi renvoyé à une adresse non vérifiée ; politique de mot de passe alignée sur GoTrue.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'
process.env.IP_HASH_SALT = 'sel-de-test-flux-email-0123456789'

import { prepareSignup, prepareReset, type ExistingUser, type FlowDeps, type GenerateLinkArgs } from '../lib/auth/email-flows'
import { passwordSchema } from '../lib/auth/validation'
import { MemoryLimiter } from '../lib/data/server/rate-limit-core'

type Sent = { to: string; subject: string; html: string }

function fakeDeps(users: Record<string, ExistingUser>, opts: { linkError?: string; limiterDown?: boolean } = {}) {
  const sent: Sent[] = []
  const links: GenerateLinkArgs[] = []
  const lookups: string[] = []
  const mem = new MemoryLimiter()
  const deps: FlowDeps = {
    rateLimit: async (key, limit, windowMs) => (opts.limiterDown ? { ok: false, reason: 'unavailable', retryAfter: 30 } : mem.hit(key, limit, windowMs)),
    findUser: async (email) => { lookups.push(email); return users[email] ?? null },
    generateLink: async (args) => {
      links.push(args)
      if (opts.linkError) return { ok: false, code: opts.linkError }
      return { ok: true, otp: '482615', hashedToken: 'hash-abc' }
    },
    sendEmail: async (m) => { sent.push(m); return { ok: true } },
    randomPassword: () => 'Jetable-Aa1-xxxxxxxxxxxx',
    appOrigin: 'https://lienparental.fr',
  }
  return { deps, sent, links, lookups }
}

const confirmed: ExistingUser = { id: 'u1', prenom: 'Julie', confirmed: true, deleted: false }
const pending: ExistingUser = { id: 'u2', prenom: '<img src=x>Pirate', confirmed: false, deleted: false }
const NEUTRAL = { status: 200, body: { ok: true } }

test('politique de mot de passe identique à GoTrue : 8 caractères, minuscule, majuscule, chiffre', () => {
  for (const ok of ['Secret2026', 'aB3defgh']) assert.ok(passwordSchema.safeParse(ok).success, ok)
  for (const bad of ['secret2026', 'SECRET2026', 'Secretpass', 'Sec2026', 'Secret!!!!']) assert.ok(!passwordSchema.safeParse(bad).success, bad)
})

test('validation : adresse seule (le mot de passe ne transite jamais par la route)', async () => {
  const { deps } = fakeDeps({})
  for (const bad of [{}, { email: 'pas-une-adresse' }, { email: 'a@b.fr', password: 'Secret2026' }, { email: 'a@b.fr', prenom: 'x' }, 'texte']) {
    assert.equal((await prepareSignup(deps, bad, '81.2.3.4')).result.status, 422, JSON.stringify(bad))
  }
})

test('temps constant : rien n’est cherché ni envoyé avant la réponse, quelle que soit l’adresse', async () => {
  const { deps, lookups, sent, links } = fakeDeps({ 'julie@test.fr': confirmed })
  for (const email of ['julie@test.fr', 'inconnu@test.fr']) {
    const p = await prepareSignup(deps, { email }, '81.2.3.4')
    assert.deepEqual(p.result, NEUTRAL)
    assert.equal(typeof p.deliver, 'function')
  }
  assert.equal(lookups.length + sent.length + links.length, 0)
})

test('nouvelle adresse : compte créé avec un mot de passe ALÉATOIRE, sans métadonnée ; e-mail sans prénom, lien vers la page intermédiaire', async () => {
  const { deps, sent, links } = fakeDeps({})
  const p = await prepareSignup(deps, { email: 'Camille@Test.fr' }, '81.2.3.4')
  await p.deliver!()
  const l = links[0] as Extract<GenerateLinkArgs, { type: 'signup' }>
  assert.equal(l.type, 'signup')
  assert.equal(l.password, 'Jetable-Aa1-xxxxxxxxxxxx')
  assert.equal((l as Record<string, unknown>).data, undefined)
  assert.equal(sent[0]!.to, 'camille@test.fr')
  assert.match(sent[0]!.html, /482615/)
  assert.match(sent[0]!.html, /Bonjour,/)
  assert.match(sent[0]!.html, /\/auth\/confirmer\?token_hash=hash-abc&amp;type=signup&amp;next=%2Fnouveau-mot-de-passe%3Finscription%3D1/)
})

test('pré-détournement : compte en attente → nouveau code, mot de passe aléatoire, aucun texte saisi par un tiers dans l’e-mail', async () => {
  const { deps, sent, links } = fakeDeps({ 'paul@test.fr': pending })
  await (await prepareSignup(deps, { email: 'paul@test.fr' }, '81.2.3.4')).deliver!()
  assert.equal((links[0] as { password: string }).password, 'Jetable-Aa1-xxxxxxxxxxxx')
  assert.doesNotMatch(sent[0]!.html, /Pirate/)
})

test('adresse déjà confirmée : e-mail « vous avez déjà un compte » (inscription), rien au renvoi', async () => {
  const { deps, sent, links } = fakeDeps({ 'julie@test.fr': confirmed })
  await (await prepareSignup(deps, { email: 'julie@test.fr' }, '81.2.3.4')).deliver!()
  await (await prepareSignup(deps, { email: 'julie@test.fr', resend: true }, '81.2.3.4')).deliver!()
  assert.equal(links.length, 0)
  assert.equal(sent.length, 1)
  assert.match(sent[0]!.subject, /déjà un compte/)
})

test('renvoi pour une adresse inconnue : rien ; refus GoTrue (ex. weak_password) : réponse neutre, rien envoyé', async () => {
  const a = fakeDeps({})
  await (await prepareSignup(a.deps, { email: 'x@test.fr', resend: true }, '81.2.3.4')).deliver!()
  assert.equal(a.links.length + a.sent.length, 0)
  const b = fakeDeps({}, { linkError: 'weak_password' })
  const p = await prepareSignup(b.deps, { email: 'y@test.fr' }, '81.2.3.4')
  assert.deepEqual(p.result, NEUTRAL)
  await p.deliver!()
  assert.equal(b.sent.length, 0)
})

test('limites : 3 / 15 min par adresse, 10 / h par IP, limiteur indisponible → 503', async () => {
  const { deps } = fakeDeps({})
  const codes: number[] = []
  for (let i = 0; i < 4; i++) codes.push((await prepareSignup(deps, { email: 'x@test.fr', resend: true }, '81.2.3.4')).result.status)
  assert.deepEqual(codes, [200, 200, 200, 429])
  const ipCodes: number[] = []
  for (let i = 0; i < 12; i++) ipCodes.push((await prepareSignup(deps, { email: `u${i}@test.fr` }, '90.1.1.1')).result.status)
  assert.equal(ipCodes.filter((c) => c === 429).length, 2)
  const down = fakeDeps({}, { limiterDown: true })
  const r = (await prepareSignup(down.deps, { email: 'z@test.fr' }, '81.2.3.4')).result
  assert.equal(r.status, 503)
  assert.ok('retryAfter' in r && r.retryAfter > 0)
})

test('anti-bombardement : 5 e-mails d’authentification par adresse et par 24 h, tous parcours confondus', async () => {
  const { deps } = fakeDeps({})
  const codes: number[] = []
  // Adresses d'IP différentes et fenêtres courtes contournées : seul le plafond quotidien joue.
  for (let i = 0; i < 3; i++) codes.push((await prepareSignup(deps, { email: 'cible@test.fr' }, `10.0.0.${i}`)).result.status)
  for (let i = 0; i < 3; i++) codes.push((await prepareReset(deps, { email: 'cible@test.fr' }, `10.0.1.${i}`)).result.status)
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429])
})

test('mot de passe oublié : réponse neutre immédiate ; envoi différé seulement si le compte existe', async () => {
  const known = fakeDeps({ 'julie@test.fr': confirmed })
  const a = await prepareReset(known.deps, { email: 'Julie@Test.fr' }, '81.2.3.4')
  assert.deepEqual(a.result, NEUTRAL)
  assert.equal(known.sent.length, 0, 'rien avant la réponse')
  await a.deliver!()
  assert.equal(known.links[0]!.type, 'recovery')
  assert.match(known.sent[0]!.html, /\/auth\/confirmer\?token_hash=hash-abc&amp;type=recovery&amp;next=%2Fnouveau-mot-de-passe/)
  assert.match(known.sent[0]!.html, /Bonjour Julie,/)

  const unknown = fakeDeps({})
  const b = await prepareReset(unknown.deps, { email: 'inconnu@test.fr' }, '81.2.3.4')
  assert.deepEqual(b.result, a.result)
  await b.deliver!()
  assert.equal(unknown.sent.length + unknown.links.length, 0)
  assert.equal((await prepareReset(unknown.deps, { email: 'nope' }, '81.2.3.4')).result.status, 422)

  const pend = fakeDeps({ 'paul@test.fr': pending })
  await (await prepareReset(pend.deps, { email: 'paul@test.fr' }, '81.2.3.4')).deliver!()
  assert.doesNotMatch(pend.sent[0]!.html, /Pirate/)
})
