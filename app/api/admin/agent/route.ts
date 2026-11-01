/**
 * POST /api/admin/agent { op, ... } — back-office de l'agent d'accueil (0640) : base de connaissances
 * (versions, publication, programmation, retour arrière), représentants, types de rendez-vous,
 * indisponibilités, rendez-vous, rappels, textes par défaut. Administrateur requis (adminRoute :
 * même origine + is_admin ; RLS is_admin_aal2) ; chaque opération est journalisée avant d'être faite.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { zodIssues } from '@/lib/contenus/types'
import { AdminOpSchema, runAdminOp } from '@/lib/agent/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    const body = AdminOpSchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    return apiOk({ data: await runAdminOp(ctx, body.data) })
  })
}
