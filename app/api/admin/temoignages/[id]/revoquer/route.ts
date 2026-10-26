/**
 * POST /api/admin/temoignages/[id]/revoquer  { reason } → { data: { revoked: boolean } }
 * Révoque un lien de témoignage encore ouvert (motif contrôlé, audit en base). Le contenu
 * d'un témoignage déjà reçu n'est ni lu ni supprimé.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { revokeTestimonyRequest } from '@/lib/admin/ops/temoignages'
import { REVOKE_REASONS } from '@/lib/admin/ops/types'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ reason: z.enum(REVOKE_REASONS) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = bodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Choisissez un motif.')
    const revoked = await revokeTestimonyRequest(ctx, id, body.data.reason)
    return apiOk({ data: { revoked } })
  })
}
