/**
 * Notes vocales de la messagerie : repli de lecture (WebM non lu par l'iPhone → WAV).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeWav, needsFallback } from '../components/messages/audioFallback'

test('encodeWav : en-tête WAV PCM 16 bits mono et échantillons bornés', async () => {
  const blob = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 22_050)
  assert.equal(blob.type, 'audio/wav')
  const v = new DataView(await blob.arrayBuffer())
  const str = (o: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)))
  assert.equal(str(0, 4), 'RIFF')
  assert.equal(str(8, 4), 'WAVE')
  assert.equal(v.getUint16(22, true), 1) // mono
  assert.equal(v.getUint32(24, true), 22_050)
  assert.equal(v.getUint16(34, true), 16) // 16 bits
  assert.equal(v.getUint32(40, true), 10) // 5 échantillons × 2 octets
  assert.equal(v.getInt16(46, true), 0x7fff) // 1 → max
  assert.equal(v.getInt16(48, true), -0x8000) // -1 → min
  assert.equal(v.getInt16(50, true), 0x7fff) // 2 borné
})

test('needsFallback : sans navigateur (rendu serveur), jamais de conversion', () => {
  assert.equal(needsFallback('audio/webm'), false)
  assert.equal(needsFallback(undefined), false)
})
