/**
 * POST /api/admin/credits/config → { data: { version } }
 *   { config: CreditConfig, reason: string }
 * Publie une NOUVELLE version de la configuration des crédits IA (aucune n'est écrasée) : coûts par
 * action, crédits mensuels par formule, packs (prix, quantité, actif), validité, plafonds, tarifs
 * fournisseur. Validation stricte (zod, lib/ai/credit-config.ts) puis par la base ; motif
 * obligatoire ; audit dans la même transaction (0520). Garde admin + contrôle d'Origin.
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { publishConfig } from '@/lib/admin/ops/credits'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    const body = (await readJson(req)) as { config?: unknown; reason?: unknown } | null
    if (!body || typeof body !== 'object' || typeof body.reason !== 'string') return apiError(422, 'invalid', 'Requête invalide : configuration et motif attendus.')
    const version = await publishConfig(ctx, body.config, body.reason)
    return apiOk({ data: { version } })
  })
}
