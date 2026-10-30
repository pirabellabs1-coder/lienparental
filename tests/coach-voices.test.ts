/** Voix du Coach : liste des voix et texte effectivement lu à voix haute. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COACH_VOICES, DEFAULT_COACH_VOICE, SPEECH_MAX_CHARS, isCoachVoice, speechText } from '../lib/ai/voices'

test('quatre voix : deux féminines, deux masculines, dont Koraly (vidéo) par défaut', () => {
  assert.equal(COACH_VOICES.length, 4)
  assert.equal(COACH_VOICES.filter((v) => v.gender === 'female').length, 2)
  assert.equal(COACH_VOICES.filter((v) => v.gender === 'male').length, 2)
  assert.equal(DEFAULT_COACH_VOICE, 'koraly')
  assert.equal(COACH_VOICES.find((v) => v.key === 'koraly')?.id, 'rbFGGoDXFHtVghjHuS3E')
  assert.ok(isCoachVoice('fabien'))
  assert.ok(!isCoachVoice('rbFGGoDXFHtVghjHuS3E'))
  assert.ok(!isCoachVoice(undefined))
})

test('texte lu : sans Markdown ni « Sources », puces en phrases', () => {
  const raw = '## Conseils\n**Restez calme** avant de répondre\n\n- Relisez votre message\n- Gardez les faits\n\nSources : journal, calendrier'
  assert.equal(speechText(raw), 'Conseils.\nRestez calme avant de répondre.\nRelisez votre message.\nGardez les faits.')
})

test('texte lu : borné et coupé à une fin de phrase', () => {
  const long = Array.from({ length: 400 }, (_, i) => `Phrase numéro ${i}.`).join(' ')
  const out = speechText(long)
  assert.ok(out.length <= SPEECH_MAX_CHARS)
  assert.ok(out.endsWith('.'))
})
