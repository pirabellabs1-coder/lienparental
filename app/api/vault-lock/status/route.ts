/**
 * GET /api/vault-lock/status : état du verrou pour le parent connecté
 * (réglages non sensibles, méthodes disponibles, déverrouillage en cours).
 */
import { jsonOk } from '@/lib/data/server/http'
import { guardRead, serverError } from '@/lib/vault-lock/http'
import { buildStatus } from '@/lib/vault-lock/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardRead('status', 120)
  if (!g.ok) return g.res
  try {
    return jsonOk({ status: await buildStatus(g.principal) })
  } catch {
    return serverError()
  }
}
