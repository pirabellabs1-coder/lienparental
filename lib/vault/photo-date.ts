/**
 * Date de prise de vue d'une photo (EXIF), lue dans le navigateur avant l'envoi au coffre-fort.
 * Module PUR (aucune dépendance) : JPEG (segment APP1 « Exif ») et PNG (bloc eXIf).
 *
 * Ordre des balises : DateTimeOriginal (0x9003, prise de vue), puis DateTimeDigitized (0x9004),
 * puis DateTime (0x0132, dernière modification). On ne garde que le jour « AAAA-MM-JJ » tel
 * qu'enregistré par l'appareil (heure locale de la prise de vue : aucun fuseau à appliquer).
 * Seules les balises de date sont lues : jamais la géolocalisation.
 */

/** Octets lus en tête de fichier : le bloc EXIF d'un JPEG tient dans 64 Ko, souvent au tout début. */
export const PHOTO_DATE_SCAN_BYTES = 256 * 1024

const TAG_DATETIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TYPE_ASCII = 2
const MAX_IFD_ENTRIES = 512

type Tiff = { view: DataView; start: number; little: boolean }

function ascii(view: DataView, at: number, len: number): string {
  let s = ''
  for (let i = 0; i < len && at + i < view.byteLength; i++) {
    const c = view.getUint8(at + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

/** Entrées ASCII et pointeurs d'un répertoire TIFF (IFD). `null` si hors limites. */
function readIfd(t: Tiff, offset: number): Map<number, string | number> | null {
  const { view, start, little } = t
  const base = start + offset
  if (offset <= 0 || base + 2 > view.byteLength) return null
  const count = view.getUint16(base, little)
  if (count > MAX_IFD_ENTRIES) return null
  const out = new Map<number, string | number>()
  for (let i = 0; i < count; i++) {
    const e = base + 2 + i * 12
    if (e + 12 > view.byteLength) break
    const tag = view.getUint16(e, little)
    const type = view.getUint16(e + 2, little)
    const n = view.getUint32(e + 4, little)
    if (tag === TAG_EXIF_IFD) {
      out.set(tag, view.getUint32(e + 8, little))
    } else if (type === TYPE_ASCII && (tag === TAG_DATETIME || tag === TAG_DATETIME_ORIGINAL || tag === TAG_DATETIME_DIGITIZED)) {
      // Valeur de plus de 4 octets : stockée ailleurs, à l'offset indiqué (relatif au début TIFF).
      const at = n <= 4 ? e + 8 : start + view.getUint32(e + 8, little)
      out.set(tag, ascii(view, at, Math.min(n, 32)))
    }
  }
  return out
}

/** « AAAA:MM:JJ HH:MM:SS » → « AAAA-MM-JJ », si la date existe et n'est ni trop ancienne ni future. */
export function exifDateToDay(raw: string | undefined, today: string): string | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec((raw ?? '').trim())
  if (!m) return null
  const [, y, mo, d] = m
  const year = Number(y), month = Number(mo), day = Number(d)
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null
  // Jour réel du mois (rejette 2024:02:30) ; calcul en UTC pour rester indépendant du fuseau.
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  const iso = `${y}-${mo}-${d}`
  // Horloge d'appareil déréglée (date future) : on ne propose rien plutôt qu'une date fausse.
  return iso > today ? null : iso
}

function dateFromTiff(view: DataView, start: number, today: string): string | null {
  if (start + 8 > view.byteLength) return null
  const order = view.getUint16(start)
  const little = order === 0x4949 // « II » ; « MM » = gros-boutiste
  if (!little && order !== 0x4d4d) return null
  if (view.getUint16(start + 2, little) !== 42) return null
  const t: Tiff = { view, start, little }
  const ifd0 = readIfd(t, view.getUint32(start + 4, little))
  if (!ifd0) return null
  const exifOffset = ifd0.get(TAG_EXIF_IFD)
  const exif = typeof exifOffset === 'number' ? readIfd(t, exifOffset) : null
  for (const raw of [exif?.get(TAG_DATETIME_ORIGINAL), exif?.get(TAG_DATETIME_DIGITIZED), ifd0.get(TAG_DATETIME)]) {
    const day = typeof raw === 'string' ? exifDateToDay(raw, today) : null
    if (day) return day
  }
  return null
}

function tiffStartInJpeg(view: DataView): number | null {
  let p = 2
  while (p + 4 <= view.byteLength) {
    if (view.getUint8(p) !== 0xff) return null
    const marker = view.getUint8(p + 1)
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue }
    if (marker === 0xda || marker === 0xd9) return null // début de l'image compressée : plus de métadonnées
    const len = view.getUint16(p + 2)
    if (len < 2) return null
    // « Exif\0\0 » puis en-tête TIFF.
    if (marker === 0xe1 && p + 10 <= view.byteLength && ascii(view, p + 4, 4) === 'Exif' && view.getUint16(p + 8) === 0) return p + 10
    p += 2 + len
  }
  return null
}

function tiffStartInPng(view: DataView): number | null {
  let p = 8
  while (p + 8 <= view.byteLength) {
    const len = view.getUint32(p)
    const type = ascii(view, p + 4, 4)
    if (type === 'eXIf') return p + 8
    if (type === 'IEND') return null
    p += 12 + len
  }
  return null
}

/**
 * Jour de prise de vue (« AAAA-MM-JJ ») lu dans les premiers octets d'une photo, ou `null`
 * (pas de métadonnées, format non géré, date absente, invalide ou future). Ne lève jamais.
 * `today` : jour local de l'utilisateur, borne haute (« AAAA-MM-JJ »).
 */
export function readPhotoDate(bytes: ArrayBuffer, today: string): string | null {
  try {
    const view = new DataView(bytes)
    if (view.byteLength < 12) return null
    if (view.getUint16(0) === 0xffd8) {
      const s = tiffStartInJpeg(view)
      return s === null ? null : dateFromTiff(view, s, today)
    }
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      const s = tiffStartInPng(view)
      return s === null ? null : dateFromTiff(view, s, today)
    }
    return null
  } catch {
    return null
  }
}

/** Navigateur : lit uniquement le début du fichier (pas la photo entière en mémoire). */
export async function photoDateFromFile(file: Blob, today: string): Promise<string | null> {
  // Type parfois vide (certains navigateurs) : la signature des octets tranche de toute façon.
  if (file.type && !/^image\/(jpeg|png)$/.test(file.type)) return null
  try {
    return readPhotoDate(await file.slice(0, PHOTO_DATE_SCAN_BYTES).arrayBuffer(), today)
  } catch {
    return null
  }
}
