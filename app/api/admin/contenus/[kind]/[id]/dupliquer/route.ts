/** POST /api/admin/contenus/[kind]/[id]/dupliquer → 201 { data } (copie en brouillon, slug « -copie »). */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk } from '@/lib/contenus/api'
import { duplicateContent } from '@/lib/contenus/repo'
import { isContentKind } from '@/lib/contenus/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (!isContentKind(kind)) return apiError(404, 'unknown_kind', 'Type de contenu inconnu.')
  return adminRoute(req, async (ctx) => apiOk({ data: await duplicateContent(ctx, kind, id) }, 201))
}
