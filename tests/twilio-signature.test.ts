/**
 * Signature des webhooks Twilio (X-Twilio-Signature) : exemple de la documentation Twilio
 * (« Validating Requests are coming from Twilio »), clé 12345.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signatureMatches, twilioSignature as sign } from '../lib/agent/twilio-signature'

test('signature Twilio : exemple officiel', () => {
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' }
  assert.equal(sign('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', params), '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')
})

test('signature Twilio : paramètre modifié, URL différente ou signature absente → refus', () => {
  const params = { Body: 'Bonjour', From: 'whatsapp:+594694123456', MessageSid: 'SM1' }
  const url = 'https://lienparental.fr/api/whatsapp/webhook'
  const good = sign('tok', url, params)
  assert.equal(signatureMatches('tok', url, params, good), true)
  assert.equal(signatureMatches('tok', url, { ...params, From: 'whatsapp:+33600000000' }, good), false)
  assert.equal(signatureMatches('tok', 'https://evil.test/api/whatsapp/webhook', params, good), false)
  assert.equal(signatureMatches('tok', url, params, null), false)
  assert.equal(signatureMatches('', url, params, good), false)
})
