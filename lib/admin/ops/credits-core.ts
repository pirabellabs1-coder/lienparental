// Calculs PURS du tableau de bord des crédits IA (testés dans tests/credits-v6.test.ts).
import { PRICING } from '@/components/profil/pricing'

/** MRR à partir des effectifs par Price (annuel ramené au mois), prix TTC du code. */
export function computeMrr(subscribers: Record<string, number>): { mrr: number; byPlan: Record<'premium' | 'coparentalite', number> } {
  const byPlan = { premium: 0, coparentalite: 0 }
  for (const [plan, n] of Object.entries(subscribers)) {
    const tier = plan.startsWith('coparentalite') ? 'coparentalite' : plan.startsWith('premium') ? 'premium' : null
    if (!tier) continue
    const p = PRICING[tier]
    byPlan[tier] += n * (plan.endsWith('_yearly') ? p.yearly / 12 : p.monthly)
  }
  const round = (x: number) => Math.round(x * 100) / 100
  return { mrr: round(byPlan.premium + byPlan.coparentalite), byPlan: { premium: round(byPlan.premium), coparentalite: round(byPlan.coparentalite) } }
}
