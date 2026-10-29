/**
 * POST /api/admin/credits/adjust → { data: { outcome, total } }
 *   { userId, wallet: 'monthly' | 'purchased', delta: entier non nul (−1000..1000), reason, key }
 * Ajustement manuel d'un solde de crédits IA : motif obligatoire, clé d'idempotence (un double envoi
 * n'ajuste qu'une fois), jamais de solde négatif, interdit sur son propre compte. Écrit au journal
 * immuable (admin_id + motif) et dans audit_log, dans la même transaction (admin_credit_adjust, 0520).
 */
import type { NextRequest } from 'next/server'
import { adminRoute, apiError, apiOk, readJson } from '@/lib/contenus/api'
import { adjustBodySchema, adjustCredits } from '@/lib/admin/ops/credits'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return adminRoute(req, async (ctx) => {
    const body = adjustBodySchema.safeParse(await readJson(req))
    if (!body.success) {
      const issues = body.error.issues.map((i) => ({ path: i.path.join('.') || 'body', message: i.code === 'unrecognized_keys' ? `Champ non autorisé : ${i.keys.join(', ')}.` : i.message }))
      return apiError(422, 'invalid', issues[0]?.message ?? 'Requête invalide.', issues)
    }
    return apiOk({ data: await adjustCredits(ctx, body.data) })
  })
}
