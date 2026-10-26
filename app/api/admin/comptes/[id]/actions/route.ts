/**
 * POST /api/admin/comptes/[id]/actions  { action: 'suspend' | 'reactivate' | 'resend_verification' | 'force_logout' }
 *   → { data: { message } }
 * Garde admin (aal2) + contrôle d'Origin (adminRoute). Chaque action est journalisée
 * (avant exécution pour les actions GoTrue ; dans la même transaction pour la déconnexion).
 * Refus : son propre compte, un compte administrateur, un compte supprimé.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { runAccountAction } from '@/lib/admin/ops/comptes'
import { ACCOUNT_ACTIONS } from '@/lib/admin/ops/types'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ action: z.enum(ACCOUNT_ACTIONS) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = bodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Action inconnue.')
    return apiOk({ data: await runAccountAction(ctx, id, body.data.action) })
  })
}
