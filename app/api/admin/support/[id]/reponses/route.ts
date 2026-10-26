/**
 * POST /api/admin/support/[id]/reponses  { body, resolve? } → 201 { data: TicketMessage }
 * Ajout atomique au fil (admin_reply_ticket, 0400) : statut « en attente de l'utilisateur »
 * (ou « résolu »), notification in-app au demandeur, audit sans le texte de la réponse.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { replySchema, replyTicket } from '@/lib/admin/ops/support'
import { zodIssues } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = replySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(422, 'invalid', 'Réponse invalide.', zodIssues(body.error))
    return apiOk({ data: await replyTicket(ctx, id, body.data) }, 201)
  })
}
