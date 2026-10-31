import 'server-only'
/**
 * Acquisition (administration) : inscriptions, abonnés payants et revenus encaissés par
 * campagne (UTM), sur une période. Données agrégées uniquement (admin_acquisition_report, 0620).
 */
import { z } from 'zod'
import type { AdminCtx } from '@/lib/contenus/repo'
import { rpc, type LiveCtx } from './rpc'

export type AttributionModel = 'last' | 'first'

const rowSchema = z.object({
  source: z.string(),
  medium: z.string().nullable(),
  campaign: z.string().nullable(),
  content: z.string().nullable(),
  signups: z.coerce.number(),
  paying: z.coerce.number(),
  revenue_cents: z.coerce.number(),
})
export type AcquisitionRow = z.infer<typeof rowSchema>

export async function getAcquisitionReport(ctx: AdminCtx, days: number, model: AttributionModel): Promise<AcquisitionRow[] | null> {
  if (ctx.mode !== 'live') return null
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return rpc(ctx as LiveCtx, 'admin_acquisition_report', { p_from: from.toISOString(), p_to: to.toISOString(), p_model: model }, z.array(rowSchema))
}
