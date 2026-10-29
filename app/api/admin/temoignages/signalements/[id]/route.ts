/**
 * POST /api/admin/temoignages/signalements/[id]  { decision, note? } → { data: { status, filesRemoved } }
 * Décision sur un signalement de témoignage (0570) : « rejected » (le témoignage reste) ou
 * « removed » (le témoignage et ses pièces sont supprimés). Audit en base ; contenu jamais lu.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { decideTestimonyReport } from '@/lib/admin/ops/temoignages'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  decision: z.enum(['rejected', 'removed']),
  note: z.string().trim().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = bodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Décision invalide.')
    const out = await decideTestimonyReport(ctx, id, body.data.decision, body.data.note)
    return apiOk({ data: out })
  })
}
