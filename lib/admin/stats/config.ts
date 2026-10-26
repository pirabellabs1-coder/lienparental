import 'server-only'
// Réglages du tableau de bord (serveur uniquement).
import { PRICING } from '@/components/profil/pricing'
import type { Pricing } from './compute'

function positiveNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null
}

/**
 * Coût moyen estimé d'une analyse Coach IA, en euros.
 * Le coût réel par appel n'est pas stocké en base (journalisé dans les logs
 * serveur, cf. lib/ai/client.ts) : on l'estime à partir du nombre d'analyses.
 * Défaut 0,07 € (≈ 8 000 tokens en entrée et 2 000 en sortie au tarif Opus).
 */
export const AI_COST_PER_ANALYSIS_EUR = positiveNumber(process.env.ADMIN_AI_COST_PER_ANALYSIS_EUR) ?? 0.07

/** Budget IA mensuel (€) au-delà duquel une alerte s'affiche. Facultatif. */
export const AI_MONTHLY_BUDGET_EUR = positiveNumber(process.env.ADMIN_AI_MONTHLY_BUDGET_EUR)

export const BASE_PRICING: Pricing = {
  monthlyEur: PRICING.premium.monthly,
  yearlyEur: PRICING.premium.yearly,
  coparentaliteMonthlyEur: PRICING.coparentalite.monthly,
  coparentaliteYearlyEur: PRICING.coparentalite.yearly,
  aiCostPerAnalysisEur: AI_COST_PER_ANALYSIS_EUR,
}
