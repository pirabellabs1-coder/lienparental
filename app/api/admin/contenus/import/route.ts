/**
 * POST /api/admin/contenus/import  { what: 'guide' | 'modeles' | 'blog' | 'aide' } → { data: ImportReport }
 * Copie en base les contenus du dépôt (semences) sans écraser l'existant. Supabase uniquement :
 * en démonstration, ces contenus sont déjà chargés.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson, revalidateFor } from '@/lib/contenus/api'
import { importSeeds } from '@/lib/contenus/repo'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ what: z.enum(['guide', 'modeles', 'blog', 'aide']) })

const REVALIDATE = { guide: ['fiche'], modeles: ['modele'], blog: ['article'], aide: ['faq', 'conseil'] } as const
// Les traductions des fichiers (content/i18n/<locale>/…) sont importées avec chaque contenu (lib/contenus/repo.importSeeds).

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    if (ctx.mode === 'demo') return apiError(409, 'demo', 'En démonstration, les contenus du dépôt sont déjà chargés.')
    const body = bodySchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'bad_request', 'Requête invalide.')
    const report = await importSeeds(ctx, body.data.what)
    for (const kind of REVALIDATE[body.data.what]) revalidateFor(kind)
    return apiOk({ data: report })
  })
}
