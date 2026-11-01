/**
 * Signature X-Twilio-Signature (module pur, testé par tests/twilio-signature.test.ts) : HMAC-SHA1
 * (clé = Auth Token) de l'URL exacte appelée suivie des paramètres POST triés par nom (nom + valeur
 * concaténés), en base64. Comparaison à temps constant.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function signatureMatches(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!authToken || !signature) return false
  const expected = Buffer.from(twilioSignature(authToken, url, params))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
