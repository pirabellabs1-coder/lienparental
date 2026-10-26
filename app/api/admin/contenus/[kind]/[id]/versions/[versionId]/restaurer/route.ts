/**
 * POST /api/admin/contenus/[kind]/[id]/versions/[versionId]/restaurer  { version } → { data }
 * Restaure le contenu d'une version (le statut courant est conservé) ; crée une nouvelle version.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson, revalidateFor, versionBodySchema } from '@/lib/contenus/api'
import { restoreVersion } from '@/lib/contenus/repo'
import { isContentKind, zodIssues } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string; id: string; versionId: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { kind, id, versionId } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => {
    const body = versionBodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    const rec = await restoreVersion(ctx, kind, id, versionId, body.data.version)
    revalidateFor(kind, rec.slug)
    return apiOk({ data: rec })
  })
}
