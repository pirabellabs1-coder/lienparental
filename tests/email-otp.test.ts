/**
 * Code d'inscription reçu par e-mail (bug de production : code de 7 chiffres refusé par un écran à 6 cases).
 * - logique pure du champ unique (lib/auth/email-otp.ts) : normalisation, bornes 6–10, validation auto ;
 * - schémas : emailOtpSchema 6–10, otpSchema (2FA TOTP) reste à 6 ;
 * - serveur (email-flows) : code hors format → erreur journalisée SANS le code ;
 * - garde-fous de source : écran de vérification, inscription (confirmation, pas d'alerte transitoire),
 *   connexion d'un compte non confirmé (notre flux, pas supabase.auth.resend).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'
process.env.IP_HASH_SALT = 'sel-de-test-email-otp-0123456789'

import {
  EMAIL_OTP_MAX, EMAIL_OTP_MIN, isBulkInsert, isDemoEmailOtp, isEmailOtp, normalizeEmailOtp, parseEmailOtpLength, shouldAutoVerify,
} from '../lib/auth/email-otp'
import { emailOtpSchema, otpSchema } from '../lib/auth/validation'
import { prepareSignup, type FlowDeps } from '../lib/auth/email-flows'
import { MemoryLimiter } from '../lib/data/server/rate-limit-core'

const root = join(__dirname, '..')
const src = (p: string) => readFileSync(join(root, p), 'utf8')

test('bornes : constante unique 6–10', () => {
  assert.equal(EMAIL_OTP_MIN, 6)
  assert.equal(EMAIL_OTP_MAX, 10)
})

test('normalisation : espaces, tirets et autres séparateurs ignorés, au plus 10 chiffres', () => {
  assert.equal(normalizeEmailOtp('123 456 7'), '1234567')
  assert.equal(normalizeEmailOtp('1234-5678'), '12345678')
  assert.equal(normalizeEmailOtp(' 12.34.56 '), '123456')
  assert.equal(normalizeEmailOtp('Code : 482615\n'), '482615')
  assert.equal(normalizeEmailOtp('1234567890123'), '1234567890')
  assert.equal(normalizeEmailOtp('abc'), '')
  assert.equal(normalizeEmailOtp(''), '')
})

test('code complet : 6 à 10 chiffres exactement', () => {
  for (const ok of ['123456', '1234567', '12345678', '123456789', '1234567890']) {
    assert.ok(isEmailOtp(ok), ok)
    assert.ok(emailOtpSchema.safeParse(ok).success, ok)
  }
  for (const bad of ['', '12345', '12345678901', '12345a', '123 456', '１２３４５６']) {
    assert.ok(!isEmailOtp(bad), bad)
    assert.ok(!emailOtpSchema.safeParse(bad).success, bad)
  }
})

test('2FA TOTP inchangée : otpSchema exige toujours 6 chiffres', () => {
  assert.ok(otpSchema.safeParse('123456').success)
  assert.ok(!otpSchema.safeParse('1234567').success)
})

test('longueur attendue : NEXT_PUBLIC_EMAIL_OTP_LENGTH valide 6–10, sinon inconnue', () => {
  assert.equal(parseEmailOtpLength('6'), 6)
  assert.equal(parseEmailOtpLength(' 8 '), 8)
  assert.equal(parseEmailOtpLength('10'), 10)
  for (const bad of [undefined, null, '', '5', '11', 'abc', '7.5', '-6']) assert.equal(parseEmailOtpLength(bad), null, String(bad))
})

test('validation auto : seulement code complet arrivé d’un coup ET longueur connue', () => {
  // Longueur inconnue : jamais (validation au clic), même collé.
  assert.equal(shouldAutoVerify('1234567', null, true), false)
  // Longueur connue, collage du bon nombre de chiffres : oui.
  assert.equal(shouldAutoVerify('1234567', 7, true), true)
  // Frappe chiffre par chiffre : non (pas de validation pendant la frappe).
  assert.equal(shouldAutoVerify('1234567', 7, false), false)
  // Code tronqué ou trop long par rapport au réglage : non.
  assert.equal(shouldAutoVerify('123456', 7, true), false)
  assert.equal(shouldAutoVerify('12345678', 7, true), false)
})

test('saisie en bloc (autofill) détectée, frappe simple non', () => {
  assert.equal(isBulkInsert('', '1234567'), true)
  assert.equal(isBulkInsert('12345', '123456'), false)
  assert.equal(isBulkInsert('123456', '12345'), false)
})

test('frappe chiffre par chiffre d’un code de 7 et 8 chiffres : bouton actif dès 6, valeur complète conservée', () => {
  for (const code of ['1234567', '12345678']) {
    let value = ''
    for (const k of code) {
      const next = normalizeEmailOtp(value + k)
      assert.equal(isBulkInsert(value, next), false)
      value = next
      assert.equal(value.length >= EMAIL_OTP_MIN, isEmailOtp(value))
    }
    assert.equal(value, code)
  }
  // 11e chiffre ignoré.
  assert.equal(normalizeEmailOtp('1234567890' + '1'), '1234567890')
})

test('démonstration : 123456, 1234567… 1234567890 acceptés, rien d’autre', () => {
  for (const ok of ['123456', '1234567', '12345678', '1234567890']) assert.ok(isDemoEmailOtp(ok), ok)
  for (const bad of ['12345', '654321', '1234560', '1234567891']) assert.ok(!isDemoEmailOtp(bad), bad)
})

function deps(otp: string) {
  const logs: { level: 'warn' | 'error'; msg: string; meta?: Record<string, unknown> }[] = []
  const sent: string[] = []
  const mem = new MemoryLimiter()
  const d: FlowDeps = {
    rateLimit: async (k, l, w) => mem.hit(k, l, w),
    findUser: async () => null,
    generateLink: async () => ({ ok: true, otp, hashedToken: 'hash-abc' }),
    sendEmail: async (m) => { sent.push(m.html); return { ok: true } },
    randomPassword: () => 'Jetable-Aa1-xxxxxxxxxxxx',
    appOrigin: 'https://lienparental.fr',
    log: (msg, meta) => logs.push({ level: 'warn', msg, meta }),
    logError: (msg, meta) => logs.push({ level: 'error', msg, meta }),
  }
  return { d, logs, sent }
}

test('serveur : code de 6 à 10 chiffres → aucune erreur journalisée, code dans l’e-mail', async () => {
  for (const otp of ['482615', '4826153', '48261537']) {
    const { d, logs, sent } = deps(otp)
    await (await prepareSignup(d, { email: 'camille@test.fr' }, '81.2.3.4')).deliver!()
    assert.equal(logs.length, 0, otp)
    assert.ok(sent[0]!.includes(otp), otp)
  }
})

test('serveur : code hors format → erreur explicite journalisée, SANS le code ; lien toujours envoyé', async () => {
  for (const otp of ['12345', '12345678901', 'ab12cd', '']) {
    const { d, logs, sent } = deps(otp)
    await (await prepareSignup(d, { email: 'camille@test.fr' }, '81.2.3.4')).deliver!()
    assert.equal(logs.length, 1, otp)
    assert.equal(logs[0]!.level, 'error')
    assert.match(logs[0]!.msg, /hors format/)
    assert.match(logs[0]!.msg, /Email OTP Length/)
    if (otp) assert.ok(!JSON.stringify(logs[0]).includes(otp), 'le code ne doit pas être journalisé')
    assert.equal(logs[0]!.meta?.length, otp.length)
    assert.equal(sent.length, 1)
  }
})

test('écran de vérification : champ unique 6–10 (plus de 6 cases), pas de longueur 6 en dur', () => {
  const s = src('app/(public)/onboarding/verification/page.tsx')
  assert.ok(!s.includes('OTPInput'), 'OTPInput (6 cases) ne doit plus servir au code e-mail')
  assert.ok(s.includes('EmailCodeInput'))
  assert.ok(s.includes('emailOtpSchema'))
  assert.ok(!/length\s*!==\s*6/.test(s))
  const c = src('components/onboarding/EmailCodeInput.tsx')
  for (const attr of ['inputMode="numeric"', 'autoComplete="one-time-code"', 'pattern=', 'maxLength={EMAIL_OTP_MAX}', '<FieldLabel']) assert.ok(c.includes(attr), attr)
})

test('textes : plus de « 6 chiffres » annoncés pour le code e-mail (3 langues)', () => {
  const bad = /6 chiffres|6-digit|6 dígitos/
  for (const l of ['fr', 'en', 'pt']) {
    const j = JSON.parse(src(`messages/${l}/public.json`))
    for (const [k, v] of Object.entries(j.public.onboarding.verify)) assert.ok(!bad.test(String(v)), `${l} verify.${k}`)
    assert.ok(!bad.test(JSON.stringify(JSON.parse(src(`messages/${l}/email.json`)).email.verification)), `${l} email.verification`)
  }
  for (const p of ['content/faq/comment-creer-mon-compte.md', 'content/tutoriels/bien-demarrer.md',
    'content/i18n/en/faq/comment-creer-mon-compte.md', 'content/i18n/en/tutoriels/bien-demarrer.md',
    'content/i18n/pt/faq/comment-creer-mon-compte.md', 'content/i18n/pt/tutoriels/bien-demarrer.md']) {
    assert.ok(!bad.test(src(p)), p)
  }
})

test('inscription : confirmation du mot de passe, champs non vidés avant la navigation', () => {
  const s = src('app/(public)/onboarding/inscription/page.tsx')
  assert.ok(s.includes("t('confirmPassword')"))
  assert.ok(s.includes("t('errPasswordMatch')"))
  assert.ok(!s.includes("setPassword('')"), 'vider le mot de passe avant router.push affichait l’alerte rouge')
  for (const l of ['fr', 'en', 'pt']) {
    const j = JSON.parse(src(`messages/${l}.json`))
    for (const k of ['confirmPassword', 'confirmPasswordPlaceholder', 'errPasswordMatch']) assert.ok(j.onb.signup[k], `${l} onb.signup.${k}`)
  }
  assert.equal(JSON.parse(src('messages/fr.json')).onb.signup.errPasswordMatch, 'Les deux mots de passe ne correspondent pas.')
})

test('connexion : compte non confirmé → notre flux (POST /api/auth/signup resend), jamais supabase.auth.resend', () => {
  const s = src('app/(public)/onboarding/connexion/page.tsx')
  assert.ok(!/auth\.resend\(/.test(s))
  assert.ok(/'\/api\/auth\/signup'[\s\S]{0,200}resend: true/.test(s))
  // Le mot de passe n'est effacé qu'au passage à l'étape 2FA (champ masqué), pas avant la navigation.
  assert.ok(!/setPassword\(''\)\s*\n\s*if \(await needsMfa\(\)\)/.test(s))
})
