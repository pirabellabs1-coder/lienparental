/**
 * POST /api/vault-lock/lock : reverrouille le coffre sur cet appareil (bouton « Verrouiller »,
 * inactivité, passage en arrière-plan ; compatible navigator.sendBeacon). Toujours 204.
 */
import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/data/server/http'
import { resolvePrincipal } from '@/lib/vault-lock/context'
import { isSameOrigin } from '@/lib/vault-lock/http'
import { clearUnlockCookie } from '@/lib/vault-lock/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, 'forbidden_origin', 'Origine de la requête refusée.')
  const p = await resolvePrincipal().catch(() => null)
  await clearUnlockCookie(p?.ok ? p : undefined).catch(() => undefined)
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
