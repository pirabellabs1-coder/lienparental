/**
 * GET  /api/admin/contenus/[kind]?territoire=guyane  → { data: ContentRecord[] }
 * POST /api/admin/contenus/[kind]  { data, statut?, publishedAt? } → 201 { data: ContentRecord }
 * kind : fiche | parcours | partenaire | modele | article | faq | tutoriel | conseil. Réservé aux administrateurs.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, createBodySchema, readJson, revalidateFor } from '@/lib/contenus/api'
import { createContent, listContent } from '@/lib/contenus/repo'
import { isContentKind, zodIssues } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { kind } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  const t = req.nextUrl.searchParams.get('territoire') ?? undefined
  const territoire = t && /^[a-z0-9-]{1,40}$/.test(t) ? t : undefined
  return adminRoute(req, async (ctx) => apiOk({ data: await listContent(ctx, kind, { territoire }) }))
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { kind } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => {
    const body = createBodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    const rec = await createContent(ctx, kind, body.data.data, {
      statut: body.data.statut,
      publishedAt: kind === 'article' ? body.data.publishedAt : undefined,
    })
    revalidateFor(kind, rec.slug)
    return apiOk({ data: rec }, 201)
  })
}
