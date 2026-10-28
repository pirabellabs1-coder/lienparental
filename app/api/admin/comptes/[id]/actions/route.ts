/**
 * POST /api/admin/comptes/[id]/actions → { data: { message } }
 *   { action: 'warn',       reason, details? }
 *   { action: 'suspend',    duration: '24h' | '3d' | '7d' | '30d', reason, details? }
 *   { action: 'deactivate', reason, details? }
 *   { action: 'reactivate', details? }
 *   { action: 'resend_verification' } | { action: 'force_logout' }
 * Validation stricte (zod `.strict()`, lib/admin/ops/moderation.ts) : motif de la liste, précisions
 * ≤ 500 caractères (obligatoires pour « autre »), aucun champ inconnu.
 * Garde admin + contrôle d'Origin (adminRoute). Chaque action est journalisée ; les décisions de
 * modération le sont dans account_moderation ET audit_log (même transaction, 0500).
 * Refus : son propre compte, un compte administrateur, un compte supprimé, transition impossible.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { runAccountAction } from '@/lib/admin/ops/comptes'
import { actionBodySchema } from '@/lib/admin/ops/moderation'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminRoute(req, async (ctx) => {
    const body = actionBodySchema.safeParse(await readJson(req))
    if (!body.success) {
      const issues = body.error.issues.map((i) => ({
        path: i.path.join('.') || 'action',
        message: i.code === 'unrecognized_keys' ? `Champ non autorisé : ${i.keys.join(', ')}.`
          : i.code === 'invalid_union_discriminator' ? 'Action inconnue.'
          : i.path.length === 0 ? 'Requête invalide.'
          : i.message,
      }))
      return apiError(422, 'invalid', issues[0]?.message ?? 'Action invalide.', issues)
    }
    return apiOk({ data: await runAccountAction(ctx, id, body.data) })
  })
}
