import 'server-only'
import { cache } from 'react'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import type { PlanId } from '@/components/profil/pricing'
import { hasFeature, planFromDbTier, resolveEffectivePlan, type EffectivePlan, type Feature } from './plans'
import { billingDb } from './db'
import { DEMO_BILLING, getDemoBilling } from './demo'
import { isUuid } from './sync-core'

/**
 * Plan EFFECTIF d'un utilisateur, côté serveur (droits, quotas, priorité support).
 *
 * Supabase : public.effective_plan_details (0380, service_role) = plan propre
 * (users.plan, tenu à jour par le webhook Stripe) relevé à Premium si un parent
 * lié est en Coparentalité+. Voir docs/FAMILLE.md §12.
 * Démonstration : abonnement simulé (cookie lp_demo_billing, voir lib/billing/demo-core.ts).
 * Base indisponible : on retombe sur `fallback` (le plan de la session), jamais
 * sur un niveau supérieur (fail-safe).
 *
 * Mémorisé pour la durée d'une requête (React cache).
 */
export const getEffectivePlan = cache(async (userId: string, fallback: PlanId = 'gratuit'): Promise<EffectivePlan> => {
  if (DEMO_BILLING) {
    const demo = await getDemoBilling()
    return resolveEffectivePlan(demo ? demo.plan : fallback)
  }
  if (!SUPABASE_ENABLED || !isUuid(userId) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return resolveEffectivePlan(fallback)
  }
  try {
    const { data, error } = await billingDb().rpc('effective_plan_details', { p_user_id: userId })
    if (error) throw new Error(error.code ?? 'rpc_error')
    const row = (Array.isArray(data) ? data[0] : data) as { plan: string; own_plan: string; via: string | null } | null | undefined
    if (!row) return resolveEffectivePlan('gratuit')
    const plan = planFromDbTier(row.plan)
    const own = planFromDbTier(row.own_plan)
    return { plan, own, via: row.via === 'famille' ? 'famille' : row.via === 'abonnement' ? 'abonnement' : null }
  } catch (err) {
    console.error('[billing] plan effectif indisponible', err instanceof Error ? err.message : 'unknown')
    return resolveEffectivePlan(fallback)
  }
})

/** Raccourci : l'utilisateur a-t-il accès à la fonctionnalité (plan effectif) ? */
export async function userHasFeature(user: { id: string; plan: PlanId }, feature: Feature): Promise<boolean> {
  const eff = await getEffectivePlan(user.id, user.plan)
  return hasFeature(eff.plan, feature)
}

export { hasFeature, type EffectivePlan, type Feature }
