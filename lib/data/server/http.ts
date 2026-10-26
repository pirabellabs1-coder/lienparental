import 'server-only'
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

/** Enveloppe d'erreur JSON homogène : { error: { code, message, correlation_id } }. */
export function jsonError(status: number, code: string, message: string, headers?: Record<string, string>) {
  const correlation_id = `req_${randomBytes(6).toString('hex')}`
  return NextResponse.json(
    { error: { code, message, correlation_id } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )
}

export function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Jeton opaque 32 caractères base64url (24 octets aléatoires = 192 bits). */
export function secureToken32(): string {
  return randomBytes(24).toString('base64url')
}

/** Format attendu d'un jeton public (évite d'interroger la BDD avec n'importe quoi). */
export function isPlausibleToken(t: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(t)
}

/**
 * Type réel d'un fichier d'après ses premiers octets (on ne fait jamais
 * confiance au Content-Type déclaré par le client).
 */
export function sniffMime(head: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const b = head
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
