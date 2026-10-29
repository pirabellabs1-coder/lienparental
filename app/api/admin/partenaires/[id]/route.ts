/**
 * POST /api/admin/partenaires/[id]
 *   { action: 'approve', category, publicName, tagline?, displayOrder } | { action: 'reject' } | { action: 'hide' }
 *   → 200 { data: { status } }
 * Validation d'une candidature partenaire (0550) : publication du logo et affichage automatique dans la
 * catégorie choisie. Administrateur requis (adminRoute : même origine + is_admin ; RLS is_admin_aal2).
 */
import type { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { zodIssues } from '@/lib/contenus/types'
import { PARTNER_CATEGORIES } from '@/lib/partenaires/catalog'
import { decideApplication } from '@/lib/partenaires/server'

export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    category: z.enum(PARTNER_CATEGORIES),
    publicName: z.string().trim().min(2).max(120),
    tagline: z.string().trim().max(80).optional().transform((v) => v || undefined),
    displayOrder: z.coerce.number().int().min(0).max(10000).default(100),
  }),
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('hide') }),
])

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    if (!z.string().uuid().safeParse(id).success) return apiError(404, 'not_found', 'Candidature introuvable.')
    const body = bodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.', zodIssues(body.error))
    try {
      const row = await decideApplication(ctx, id, body.data)
      revalidatePath('/partenaires')
      revalidatePath('/')
      return apiOk({ data: { status: row.status } })
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      if (m === 'not_found') return apiError(404, 'not_found', 'Candidature introuvable.')
      if (m === 'no_logo') return apiError(422, 'no_logo', 'Cette candidature n’a pas de logo : impossible de la publier.')
      console.warn('[admin/partenaires] décision impossible (%s)', m)
      return apiError(503, 'unavailable', 'Décision impossible pour le moment. Réessayez.')
    }
  })
}
