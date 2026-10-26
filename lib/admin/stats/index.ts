import 'server-only'
// Point d'entrée du tableau de bord : choisit la source (démo ou base) après
// la garde administrateur, et renvoie un résultat explicite (jamais d'écran
// blanc en cas d'erreur).
import { requireAdmin } from './guard'
import { demoDashboard } from './demo'
import { liveDashboard, StatsUnavailableError } from './db'
import { AI_MONTHLY_BUDGET_EUR, BASE_PRICING } from './config'
import type { DashboardResult, Period } from './types'

const ERRORS: Record<string, string> = {
  forbidden: 'Accès refusé par la base : votre compte n’a pas les droits administrateur (ou la double authentification n’est pas validée).',
  missing_function: 'Les fonctions de statistiques sont absentes : appliquez la migration 0310_admin_stats.sql.',
  rpc_failed: 'La base de données n’a pas pu calculer les statistiques. Réessayez dans un instant.',
}

export async function getDashboard(period: Period): Promise<DashboardResult> {
  const ctx = await requireAdmin()
  if (!ctx.ok) return { ok: false, error: ctx.message }
  if (ctx.mode === 'demo') return { ok: true, data: demoDashboard(period, BASE_PRICING, AI_MONTHLY_BUDGET_EUR) }
  try {
    return { ok: true, data: await liveDashboard(ctx.supabase, period) }
  } catch (e) {
    if (e instanceof StatsUnavailableError) return { ok: false, error: ERRORS[e.message] ?? ERRORS.rpc_failed }
    console.error('[admin-stats] échec du calcul :', e instanceof Error ? e.message.slice(0, 200) : 'inconnu')
    return { ok: false, error: 'Les statistiques renvoyées par la base sont inattendues. Vérifiez la version de la migration 0310.' }
  }
}

export { parsePeriod, periodSearch } from './period'
export type { DashboardData, Period } from './types'
