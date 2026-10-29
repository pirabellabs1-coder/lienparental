/**
 * Date de prise de vue d'une photo (`lib/vault/photo-date.ts`).
 * Fabrique de petits JPEG avec un bloc EXIF ne contenant que les balises de date testées ici.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exifDateToDay, readPhotoDate } from '../lib/vault/photo-date'

const TAG_DATETIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TYPE_ASCII = 2
const TYPE_LONG = 4

type Entry = { tag: number; type: number; value: string | number }

/**
 * Petit TIFF petit-boutiste. On place dans l'ordre :
 *   en-tête (8 o) | IFD0 (2 + 12*n + 4) | IFD Exif (2 + 12*m + 4) | zone de données ASCII.
 * Les offsets sont relatifs au début du TIFF.
 */
function tiff(ifd0: Entry[], exif: Entry[]): Uint8Array {
  // IFD0 reçoit l'entrée EXIF_IFD en plus de celles qu'on lui donne : +1 dans la taille.
  const ifd0Size = 2 + (ifd0.length + 1) * 12 + 4
  const exifSize = 2 + exif.length * 12 + 4
  const exifOff = 8 + ifd0Size
  const dataOff0 = exifOff + exifSize
  const strs: string[] = []
  const sizeOf = (e: Entry) => (e.type === TYPE_ASCII ? (e.value as string).length + 1 : 4)
  // Un ASCII tenant dans 4 octets est stocké inline, sinon dans la zone de données.
  const dataBytes = [...ifd0, ...exif].filter((e) => e.type === TYPE_ASCII && sizeOf(e) > 4).reduce((s, e) => s + sizeOf(e), 0)
  const buf = new Uint8Array(dataOff0 + dataBytes)
  const v = new DataView(buf.buffer)
  v.setUint8(0, 0x49); v.setUint8(1, 0x49); v.setUint16(2, 42, true); v.setUint32(4, 8, true)
  let dataOff = dataOff0
  const writeIfd = (at: number, entries: Entry[]) => {
    v.setUint16(at, entries.length, true)
    entries.forEach((e, i) => {
      const p = at + 2 + i * 12
      v.setUint16(p, e.tag, true)
      v.setUint16(p + 2, e.type, true)
      if (e.type === TYPE_LONG) {
        v.setUint32(p + 4, 1, true); v.setUint32(p + 8, e.value as number, true); return
      }
      const s = e.value as string + '\0'
      v.setUint32(p + 4, s.length, true)
      if (s.length <= 4) for (let j = 0; j < s.length; j++) v.setUint8(p + 8 + j, s.charCodeAt(j))
      else { v.setUint32(p + 8, dataOff, true); for (let j = 0; j < s.length; j++) v.setUint8(dataOff + j, s.charCodeAt(j)); dataOff += s.length; strs.push(s) }
    })
    v.setUint32(at + 2 + entries.length * 12, 0, true)
  }
  writeIfd(8, [...ifd0, { tag: TAG_EXIF_IFD, type: TYPE_LONG, value: exifOff }])
  writeIfd(exifOff, exif)
  return buf
}

function jpegWithExif(ifd0: Entry[], exif: Entry[]): ArrayBuffer {
  const t = tiff(ifd0, exif)
  // APP1 = marqueur FFE1 + longueur (sur 2 o, inclut la longueur) + « Exif\0\0 » + TIFF.
  const payload = new Uint8Array(2 + 6 + t.length)
  const len = payload.length // 2 (longueur) + 6 (« Exif\0\0 ») + TIFF
  payload[0] = (len >> 8) & 0xff; payload[1] = len & 0xff
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 2)
  payload.set(t, 8)
  const out = new Uint8Array(2 + 2 + payload.length + 2)
  out.set([0xff, 0xd8], 0)   // SOI
  out.set([0xff, 0xe1], 2)   // APP1
  out.set(payload, 4)
  out.set([0xff, 0xd9], out.length - 2) // EOI
  return out.buffer as ArrayBuffer
}

const asc = (tag: number, value: string): Entry => ({ tag, type: TYPE_ASCII, value })

test('exifDateToDay : « AAAA:MM:JJ HH:MM:SS » → jour, invalides rejetés', () => {
  assert.equal(exifDateToDay('2026:10:14 12:34:56', '2026-10-29'), '2026-10-14')
  assert.equal(exifDateToDay('2024:02:29 00:00:00', '2026-10-29'), '2024-02-29')
  assert.equal(exifDateToDay('2024:02:30 00:00:00', '2026-10-29'), null) // 30 février
  assert.equal(exifDateToDay('2027:01:01 00:00:00', '2026-10-29'), null) // future
  assert.equal(exifDateToDay('invalide', '2026-10-29'), null)
  assert.equal(exifDateToDay(undefined, '2026-10-29'), null)
})

test('readPhotoDate : prise de vue (DateTimeOriginal) prioritaire sur DateTime', () => {
  const buf = jpegWithExif(
    [asc(TAG_DATETIME, '2026:10:28 11:00:00')],
    [asc(TAG_DATETIME_ORIGINAL, '2026:10:14 12:34:56'), asc(TAG_DATETIME_DIGITIZED, '2026:10:20 00:00:00')],
  )
  assert.equal(readPhotoDate(buf, '2026-10-29'), '2026-10-14')
})

test('readPhotoDate : repli sur DateTimeDigitized, puis sur DateTime', () => {
  const buf = jpegWithExif(
    [asc(TAG_DATETIME, '2026:10:28 11:00:00')],
    [asc(TAG_DATETIME_DIGITIZED, '2026:10:20 00:00:00')],
  )
  assert.equal(readPhotoDate(buf, '2026-10-29'), '2026-10-20')
  const buf2 = jpegWithExif([asc(TAG_DATETIME, '2026:10:28 11:00:00')], [])
  assert.equal(readPhotoDate(buf2, '2026-10-29'), '2026-10-28')
})

test('readPhotoDate : rien sur un JPEG sans EXIF ou un buffer trop court', () => {
  const soiEoi = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
  assert.equal(readPhotoDate(soiEoi, '2026-10-29'), null)
  assert.equal(readPhotoDate(new Uint8Array(4).buffer, '2026-10-29'), null)
})

test('readPhotoDate : date future ignorée (appareil déréglé)', () => {
  const buf = jpegWithExif([], [asc(TAG_DATETIME_ORIGINAL, '2099:01:01 00:00:00')])
  assert.equal(readPhotoDate(buf, '2026-10-29'), null)
})
