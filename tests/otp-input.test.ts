/** Saisie du code à 6 chiffres (OTPInput) : transitions pures — frappe, écrasement, collage, retour arrière, focus. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBackspace, applyInput, fillFrom, focusTarget, toDigits } from '../components/onboarding/otp-logic'

/** Simule une frappe chiffre par chiffre en suivant le focus renvoyé (comme le navigateur). */
function typeAll(keys: string, length = 6) {
  let digits = toDigits('', length)
  let focus = 0
  for (const k of keys) {
    // Le focus programmatique doit être accepté (pas renvoyé vers une case précédente).
    assert.equal(focusTarget(digits, focus), focus)
    const step = applyInput(digits, focus, k)
    digits = step.digits
    focus = step.focus
  }
  return { value: digits.join(''), focus }
}

test('frappe 1-2-3-4-5-6 → 123456 (régression « 246 »)', () => {
  assert.deepEqual(typeAll('123456'), { value: '123456', focus: 5 })
})

test('chiffres répétés et non-chiffres ignorés', () => {
  assert.equal(typeAll('111111').value, '111111')
  const s = applyInput(toDigits('12', 6), 2, 'a')
  assert.equal(s.digits.join(''), '12')
})

test('case pleine : le nouveau chiffre remplace l’ancien (caret avant ou après)', () => {
  const d = toDigits('123', 6)
  assert.equal(applyInput(d, 1, '27').digits.join(''), '173')
  assert.equal(applyInput(d, 1, '72').digits.join(''), '173')
  assert.equal(applyInput(d, 1, '27').focus, 2)
})

test('plusieurs chiffres dans une case (autofill) → répartis', () => {
  const s = applyInput(toDigits('', 6), 0, '123456')
  assert.deepEqual(s, { digits: ['1', '2', '3', '4', '5', '6'], focus: 5 })
  assert.equal(applyInput(toDigits('12', 6), 2, '3456789').digits.join(''), '123456')
})

test('collage avec espaces / texte', () => {
  assert.equal(fillFrom(toDigits('', 6), 0, 'Code : 123 456').digits.join(''), '123456')
})

test('retour arrière : vide la case, puis la précédente', () => {
  let s = applyBackspace(toDigits('123', 6), 3)
  assert.deepEqual([s.digits.join(''), s.focus], ['12', 2])
  s = applyBackspace(toDigits('123', 6), 2)
  assert.deepEqual([s.digits.join(''), s.focus], ['12', 2])
  s = applyBackspace(toDigits('', 6), 0)
  assert.deepEqual([s.digits.join(''), s.focus], ['', 0])
})

test('focus sur une case après la première vide → redirigé', () => {
  assert.equal(focusTarget(toDigits('12', 6), 5), 2)
  assert.equal(focusTarget(toDigits('12', 6), 1), 1)
  assert.equal(focusTarget(toDigits('123456', 6), 4), 4)
})
