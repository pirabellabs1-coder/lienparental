/**
 * GET   /api/admin/support/[id]                         → { data: TicketDetail }
 * PATCH /api/admin/support/[id]  { status?, priority? }  → { data: { status, priority } }
 * Écriture via admin_update_ticket (0400) : audit dans la même transaction.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { getTicket, ticketPatchSchema, updateTicket } from '@/lib/admin/ops/support'
import { zodIssues } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return adminRoute(req, async (ctx) => apiOk({ data: await getTicket(ctx, id) }))
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = ticketPatchSchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    return apiOk({ data: await updateTicket(ctx, id, body.data) })
  })
}
