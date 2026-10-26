/** GET /api/admin/contenus/[kind]/[id]/versions → { data: ContentVersion[] } (50 dernières, plus récente d'abord). */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk } from '@/lib/contenus/api'
import { listVersions } from '@/lib/contenus/repo'
import { isContentKind } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => apiOk({ data: await listVersions(ctx, kind, id) }))
}
