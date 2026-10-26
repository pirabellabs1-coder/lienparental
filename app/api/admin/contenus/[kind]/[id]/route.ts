/**
 * GET    /api/admin/contenus/[kind]/[id]                                         → { data }
 * PATCH  /api/admin/contenus/[kind]/[id]  { version, data?, statut?, publishedAt? } → { data }
 *        409 `conflict` si `version` n'est plus la version courante (concurrence optimiste)
 * DELETE /api/admin/contenus/[kind]/[id]                                         → 204
 */
import { NextResponse, type NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, patchBodySchema, readJson, revalidateFor } from '@/lib/contenus/api'
import { deleteContent, getContent, updateContent } from '@/lib/contenus/repo'
import { isContentKind, zodIssues } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string; id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => apiOk({ data: await getContent(ctx, kind, id) }))
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => {
    const body = patchBodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    const before = await getContent(ctx, kind, id)
    const rec = await updateContent(ctx, kind, id, {
      data: body.data.data,
      statut: body.data.statut,
      publishedAt: kind === 'article' ? body.data.publishedAt : undefined,
    }, body.data.version)
    revalidateFor(kind, rec.slug)
    if (before.slug !== rec.slug) revalidateFor(kind, before.slug)
    return apiOk({ data: rec })
  })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { kind, id } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => {
    const before = await getContent(ctx, kind, id)
    await deleteContent(ctx, kind, id)
    revalidateFor(kind, before.slug)
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  })
}
