/**
 * lib/agent/voice-core.ts : TwiML échappé, choix de langue, intentions dites, texte pour l'oral,
 * numéro d'appelant exploitable.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callerNumber, dial, forSpeech, gather, pickLanguage, say, twiml, voiceIntent } from '../lib/agent/voice-core'

test('TwiML : voix neuronale par langue, texte échappé (aucune balise injectable)', () => {
  assert.equal(say('Bonjour <Hangup/> & bienvenue', 'fr'), '<Say voice="Polly.Lea-Neural" language="fr-FR">Bonjour &lt;Hangup/&gt; &amp; bienvenue</Say>')
  const g = gather({ action: '/api/voice/turn?l=pt&n=0', locale: 'pt', prompt: 'Olá', onSilence: '/api/voice/turn?l=pt&n=1' })
  assert.match(g, /<Gather input="speech" action="\/api\/voice\/turn\?l=pt&amp;n=0" method="POST" language="pt-BR"/)
  assert.match(g, /<Redirect method="POST">\/api\/voice\/turn\?l=pt&amp;n=1<\/Redirect>$/)
  assert.equal(dial('+594694000000', '/api/voice/dial?l=fr&i=0', '+33939000000'), '<Dial timeout="20" action="/api/voice/dial?l=fr&amp;i=0" method="POST" callerId="+33939000000"><Number>+594694000000</Number></Dial>')
  assert.match(twiml(say('x', 'en')), /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Say voice="Polly.Joanna-Neural"/)
})

test('langue : touches 1 / 2 / 3 ou langue dite', () => {
  assert.equal(pickLanguage('1', undefined), 'fr')
  assert.equal(pickLanguage('2', undefined), 'en')
  assert.equal(pickLanguage('3', undefined), 'pt')
  assert.equal(pickLanguage(undefined, 'Português, por favor'), 'pt')
  assert.equal(pickLanguage(undefined, 'English please'), 'en')
  assert.equal(pickLanguage('9', 'euh'), null)
})

test('intentions dites (FR / EN / PT), question libre sinon', () => {
  assert.equal(voiceIntent('Je voudrais parler à un conseiller'), 'humain')
  assert.equal(voiceIntent('Can I talk to a representative?'), 'humain')
  assert.equal(voiceIntent('Pouvez-vous me rappeler demain ?'), 'rappel')
  assert.equal(voiceIntent('Je veux prendre un rendez-vous'), 'rdv')
  assert.equal(voiceIntent('Quelle est votre adresse e-mail ?'), 'email')
  assert.equal(voiceIntent('Non merci, au revoir'), 'fin')
  assert.equal(voiceIntent('Combien coûte l’abonnement Premium ?'), null)
})

test('texte pour l’oral : liens, puces, jetons et emojis retirés, longueur bornée', () => {
  assert.equal(forSpeech('Trois formules :\n- Gratuit\n- Premium\nDétails dans [les tarifs](/#tarifs) 👋\n[[INSCRIPTION]]'), 'Trois formules : Gratuit. Premium. Détails dans les tarifs.')
  assert.ok(forSpeech('Phrase. '.repeat(200)).length <= 600)
})

test('numéro d’appelant : masqué ou « anonymous » inexploitable', () => {
  assert.equal(callerNumber('+594694123456'), '+594694123456')
  assert.equal(callerNumber('anonymous'), null)
  assert.equal(callerNumber('+266696687'), '+266696687')
  assert.equal(callerNumber(''), null)
})

test('texte pour l’oral : question gardée telle quelle, texte vide reste vide', () => {
  assert.equal(forSpeech('Que souhaitez-vous savoir ?'), 'Que souhaitez-vous savoir ?')
  assert.equal(forSpeech('[[HUMAIN]]'), '')
})
