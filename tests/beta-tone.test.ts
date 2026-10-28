/** Contrôle du ton (analyse locale) : détection FR/EN/PT sans accents, reformulation dans la langue de l'interface, sans insulte. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCAL_TONE_THRESHOLD, localToneAnalysis, normalizeTone, toneScore, type ToneLocalLabels } from '../components/messages/toneLocal'
import fr from '../messages/fr/messaging.json'
import en from '../messages/en/messaging.json'
import pt from '../messages/pt/messaging.json'

const labelsOf = (cat: typeof fr): ToneLocalLabels => {
  const l = cat.messaging.tone.local
  return { openingNamed: (name) => l.openingNamed.replace('{name}', name), opening: l.opening, closing: l.closing, resume: l.resume }
}

test('normalisation : accents et apostrophes', () => {
  assert.equal(normalizeTone('Você n’écoute JAMAIS'), "voce n'ecoute jamais")
})

test('messages agressifs détectés en français, anglais et portugais', () => {
  for (const msg of [
    'You are always late, you are useless…',
    'you never tell me anything',
    'você nunca avisa quando atrasa!',
    'voce nunca avisa quando atrasa!',
    'Você é inútil e irresponsável.',
    'Tu ne préviens jamais quand tu es en retard !',
    "C'est ta faute, tu es égoïste.",
    'Tu es egoiste',
  ]) {
    assert.ok(toneScore(msg) >= LOCAL_TONE_THRESHOLD, `${msg} → ${toneScore(msg)}`)
  }
})

test('messages factuels non signalés', () => {
  for (const msg of [
    'Je récupère les enfants à 18h vendredi.',
    'I will pick up the kids at 6 pm on Friday.',
    'Vou buscar as crianças às 18h na sexta-feira.',
    'Can we swap weekends in November?',
  ]) {
    assert.ok(toneScore(msg) < LOCAL_TONE_THRESHOLD, `${msg} → ${toneScore(msg)}`)
  }
})

test('reformulation dans la langue de l’interface, jamais avec l’insulte', () => {
  const r = localToneAnalysis('You are always late, you are useless. The pickup is at 6 pm.', 'Thomas', labelsOf(en))
  assert.ok(r.reformulation.startsWith('Hello Thomas'), r.reformulation)
  assert.match(r.reformulation, /The pickup is at 6 pm\./)
  assert.doesNotMatch(r.reformulation, /useless|always late|Bonjour/i)
  assert.equal(r.resume, en.messaging.tone.local.resume)

  const p = localToneAnalysis('você nunca avisa quando atrasa! Você é inútil.', 'Thomas', labelsOf(pt))
  assert.ok(p.reformulation.startsWith('Olá, Thomas'), p.reformulation)
  assert.doesNotMatch(normalizeTone(p.reformulation), /nunca avisa|inutil|bonjour/)

  const f = localToneAnalysis('Tu es nul !! Rendez-vous samedi à 10h.', '', labelsOf(fr))
  assert.ok(f.reformulation.startsWith(fr.messaging.tone.local.opening), f.reformulation)
  assert.doesNotMatch(f.reformulation, /\bnul\b/)
  assert.match(f.reformulation, /Rendez-vous samedi à 10h\./)
})

test('parité des libellés locaux FR/EN/PT', () => {
  const keys = (c: typeof fr) => Object.keys(c.messaging.tone.local).sort().join(',')
  assert.equal(keys(en), keys(fr))
  assert.equal(keys(pt), keys(fr))
})
