/**
 * lib/agent/wa-core.ts : lecture des webhooks WaChap (formes courantes), numéros, langue, choix,
 * commandes, conversion du texte pour WhatsApp.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buttonLabel, detectCommand, detectLocale, extractInbound, normalizePhone, pickOption, shapeOf, toWhatsAppText, yesNo } from '../lib/agent/wa-core'

test('webhook : forme Baileys « messages.upsert » (texte, bouton, envoyé par nous)', () => {
  const payload = {
    instance_id: 'X', data: { event: 'messages.upsert', data: { messages: [
      { key: { remoteJid: '594694123456@s.whatsapp.net', fromMe: false, id: 'A1' }, pushName: 'Marie', message: { conversation: 'Bonjour, quels sont vos tarifs ?' } },
      { key: { remoteJid: '594694123456@s.whatsapp.net', fromMe: false, id: 'A2' }, message: { buttonsResponseMessage: { selectedButtonId: 'act:rdv', selectedDisplayText: 'Prendre rendez-vous' } } },
      { key: { remoteJid: '594694123456@s.whatsapp.net', fromMe: true, id: 'A3' }, message: { extendedTextMessage: { text: 'Je vous rappelle demain.' } } },
    ] } },
  }
  const got = extractInbound(payload)
  assert.equal(got.length, 3)
  assert.deepEqual(got[0], { id: 'A1', phone: '594694123456', name: 'Marie', text: 'Bonjour, quels sont vos tarifs ?', buttonId: null, fromMe: false })
  assert.equal(got[1]!.buttonId, 'act:rdv')
  assert.equal(got[1]!.text, 'Prendre rendez-vous')
  assert.equal(got[2]!.fromMe, true)
})

test('webhook : objet plat et enveloppe « data », doublons fusionnés', () => {
  const flat = { event: 'message', data: { from: '+594 694 12 34 56', body: 'Hello', id: 'B1', pushName: 'Tom' } }
  assert.deepEqual(extractInbound(flat), [{ id: 'B1', phone: '594694123456', name: 'Tom', text: 'Hello', buttonId: null, fromMe: false }])
  const dup = { data: { from: '594694123456', body: 'x', id: 'C1' }, message: { from: '594694123456', body: 'x', id: 'C1' } }
  assert.equal(extractInbound(dup).length, 1)
})

test('webhook : groupes, statuts, accusés de lecture et formats inconnus ignorés', () => {
  assert.deepEqual(extractInbound({ data: { messages: [{ key: { remoteJid: '1203630@g.us', id: 'G' }, message: { conversation: 'groupe' } }] } }), [])
  assert.deepEqual(extractInbound({ data: { messages: [{ key: { remoteJid: 'status@broadcast', id: 'S' }, message: { conversation: 'statut' } }] } }), [])
  assert.deepEqual(extractInbound({ event: 'messages.update', data: { status: 'READ', id: 'R' } }), [])
  assert.deepEqual(extractInbound('texte'), [])
  assert.deepEqual(shapeOf({ a: 'secret', b: [{ c: 1 }] }), { a: 'string', b: [{ c: 'number' }] })
})

test('numéros : format international, chiffres seuls', () => {
  assert.equal(normalizePhone('594694123456:12@s.whatsapp.net'), '594694123456')
  assert.equal(normalizePhone('+55 (11) 98765-4321'), '5511987654321')
  assert.equal(normalizePhone('123'), null)
  assert.equal(normalizePhone('abc@newsletter'), null)
})

test('langue du premier message', () => {
  assert.equal(detectLocale('Bonjour, je voudrais un rendez-vous'), 'fr')
  assert.equal(detectLocale('Hello, how much is it?'), 'en')
  assert.equal(detectLocale('Olá, quero marcar uma reunião'), 'pt')
})

test('choix : bouton, numéro, libellé tapé ; oui / non', () => {
  const opts = [{ id: 'decouverte', label: 'Présentation / découverte' }, { id: 'commercial', label: 'Commercial' }, { id: 'partenariat', label: 'Partenariat' }]
  assert.equal(pickOption({ text: 'x', buttonId: 'commercial' }, opts)?.id, 'commercial')
  assert.equal(pickOption({ text: '3', buttonId: null }, opts)?.id, 'partenariat')
  assert.equal(pickOption({ text: '2.', buttonId: null }, opts)?.id, 'commercial')
  assert.equal(pickOption({ text: 'partenariat', buttonId: null }, opts)?.id, 'partenariat')
  assert.equal(pickOption({ text: '9', buttonId: null }, opts), null)
  assert.equal(pickOption({ text: 'bof', buttonId: null }, opts), null)
  assert.equal(yesNo({ text: 'Oui', buttonId: null }), true)
  assert.equal(yesNo({ text: 'não', buttonId: null }), false)
  assert.equal(yesNo({ text: 'peut-être', buttonId: null }), null)
})

test('commandes reconnues, question libre sinon', () => {
  assert.equal(detectCommand('menu'), 'menu')
  assert.equal(detectCommand('Je veux prendre un rendez-vous'), 'rdv')
  assert.equal(detectCommand('Annuler mon rendez-vous'), 'mes-rdv')
  assert.equal(detectCommand('my appointment'), 'mes-rdv')
  assert.equal(detectCommand('Pouvez-vous me rappeler ?'), 'rappel')
  assert.equal(detectCommand('je veux parler à un conseiller'), 'humain')
  assert.equal(detectCommand('Combien coûte l’abonnement Premium ?'), null)
})

test('texte pour WhatsApp : liens complets, gras WhatsApp ; boutons ≤ 20 caractères', () => {
  assert.equal(toWhatsAppText('Voir **le Guide** : [le Guide parental](/guide).', 'https://lienparental.fr'), 'Voir *le Guide* : le Guide parental : https://lienparental.fr/guide.')
  assert.equal(buttonLabel('Prendre rendez-vous'), 'Prendre rendez-vous')
  assert.ok(buttonLabel('Parler à un représentant de l’association').length <= 20)
})
