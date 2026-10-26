/**
 * GET  /api/admin/guides/territoires → { data: Territoire[] }
 * POST /api/admin/guides/territoires { code, nom, disponible, ordre } → { data } (création ou mise à jour)
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson, revalidateFor } from '@/lib/contenus/api'
import { listTerritoiresAdmin, saveTerritoire } from '@/lib/contenus/repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return adminRoute(req, async (ctx) => apiOk({ data: await listTerritoiresAdmin(ctx) }))
}

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    const body = await readJson(req)
    if (!body) return apiError(400, 'bad_request', 'Requête invalide.')
    const t = await saveTerritoire(ctx, body)
    revalidateFor('fiche')
    return apiOk({ data: t })
  })
}
