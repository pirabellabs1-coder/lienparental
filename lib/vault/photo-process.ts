'use client'

/**
 * Préparation d'une photo de l'album AVANT l'envoi (navigateur uniquement) :
 *   - date de prise de vue lue dans l'original (EXIF, lib/vault/photo-date) ;
 *   - orientation appliquée (le navigateur dessine l'image redressée) ;
 *   - version web ≤ 2560 px et vignette ≤ 480 px, ré-encodées en JPEG : toutes les métadonnées de
 *     l'original disparaissent, dont la géolocalisation GPS (spécification Album V4, § 2 et § 17).
 * Les PNG transparents reçoivent un fond blanc (JPEG sans canal alpha).
 */
import { photoDateFromFile } from './photo-date'

export const PHOTO_MAX_SIDE = 2560
export const THUMB_MAX_SIDE = 480
export const PHOTO_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png'

export type PreparedPhoto = {
  web: Blob
  thumb: Blob
  width: number
  height: number
  /** Jour de prise de vue (AAAA-MM-JJ) lu dans l'original, ou null. */
  takenOn: string | null
}

/** Dimensions réduites (côté le plus long ≤ max), sans jamais agrandir. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const k = max / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}

function encode(img: HTMLImageElement, max: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('canvas'))
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality))
}

/** Lève une Error('decode') si le fichier n'est pas une image lisible par le navigateur. */
export async function preparePhoto(file: File, today: string): Promise<PreparedPhoto> {
  const takenOn = await photoDateFromFile(file, today)
  const img = await loadImage(file)
  const [web, thumb] = await Promise.all([encode(img, PHOTO_MAX_SIDE, 0.88), encode(img, THUMB_MAX_SIDE, 0.8)])
  const size = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX_SIDE)
  return { web, thumb, width: size.width, height: size.height, takenOn }
}
