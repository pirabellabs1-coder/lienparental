/**
 * GET    /api/admin/comptes/[id]  → { data: AccountDetail }  (fiche minimale)
 * DELETE /api/admin/comptes/[id]  { confirm: 'SUPPRIMER', email: <adresse exacte du compte> } → { data: { message } }
 *   Double confirmation (mot-clé + adresse retapée), résiliation Stripe immédiate et
 *   anonymisation par la même logique que la suppression par l'utilisateur
 *   (lib/account/deletion.ts), audit admin.account.delete écrit avant exécution.
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { deleteAccountAsAdmin, getAccount } from '@/lib/admin/ops/comptes'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return adminRoute(req, async (ctx) => apiOk({ data: await getAccount(ctx, id) }))
}

const deleteSchema = z.object({ confirm: z.literal('SUPPRIMER'), email: z.string().trim().min(3).max(320) })

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = deleteSchema.safeParse(await readJson(req))
    if (!body.success) return apiError(400, 'confirmation_required', 'Confirmation manquante : saisissez SUPPRIMER et l’adresse du compte.')
    return apiOk({ data: await deleteAccountAsAdmin(ctx, id, body.data.email) })
  })
}
