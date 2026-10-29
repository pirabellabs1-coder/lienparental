import 'server-only'
/**
 * Administration des crédits IA (cahier V6, 0520) : configuration VERSIONNÉE (coûts par action,
 * crédits mensuels, packs, validité, plafonds), tableau de bord (abonnés, MRR/ARR, recharges,
 * crédits attribués / consommés / achetés / expirés, coût IA moyen et P95 par action et par modèle,
 * marge estimée par formule, paiements échoués) et ajustement manuel motivé d'un solde.
 *
 * Appels avec la session de l'administrateur (fonctions SQL gardées par admin_ops_assert), audit
 * dans la même transaction. Les prix d'ABONNEMENT ne sont pas configurables ici : ils vivent dans le
 * code et dans Stripe (un Price Stripe est immuable ; docs/STRIPE.md).
 * MINIMISATION : aucune lecture de contenu familial — types d'écritures, montants et dates seulement.
 */
import { z } from 'zod'
import { RepoError, type AdminCtx } from '@/lib/contenus/repo'
import { DEFAULT_CREDIT_CONFIG, creditConfigSchema, parseCreditConfig, type CreditConfig } from '@/lib/ai/credit-config'
import { invalidateCreditConfig } from '@/lib/ai/credit-config-server'
import type { PlanId } from '@/components/profil/pricing'
import { computeMrr } from './credits-core'
import { rpc, type LiveCtx } from './rpc'

export type ConfigVersion = { version: number; config: CreditConfig; reason: string; createdBy: string | null; createdAt: string }

const historySchema = z.array(z.object({
  version: z.number(),
  config: z.unknown(),
  reason: z.string(),
  created_by_email: z.string().nullable(),
  created_at: z.string(),
}))

export async function getConfigHistory(ctx: AdminCtx): Promise<ConfigVersion[]> {
  if (ctx.mode !== 'live') {
    return [{ version: 1, config: DEFAULT_CREDIT_CONFIG, reason: 'Version initiale V6 (démonstration)', createdBy: null, createdAt: new Date(0).toISOString() }]
  }
  const rows = await rpc(ctx as LiveCtx, 'admin_credit_config_history', { p_limit: 20 }, historySchema)
  return rows.flatMap((r) => {
    const config = parseCreditConfig(r.config)
    return config ? [{ version: r.version, config, reason: r.reason, createdBy: r.created_by_email, createdAt: r.created_at }] : []
  })
}

/** Publie une nouvelle version (validée ici puis par la base) ; motif obligatoire. */
export async function publishConfig(ctx: AdminCtx, raw: unknown, reason: string): Promise<number> {
  if (ctx.mode !== 'live') throw new RepoError('forbidden', 'Démonstration : la configuration n’est pas enregistrée.')
  const parsed = creditConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }))
    throw new RepoError('invalid', `Configuration refusée : ${issues[0]?.path || 'racine'} — ${issues[0]?.message ?? 'invalide'}.`, issues)
  }
  const r = reason.trim()
  if (r.length < 5 || r.length > 500) throw new RepoError('invalid', 'Motif obligatoire (5 à 500 caractères).')
  const version = await rpc(ctx as LiveCtx, 'admin_credit_config_set', { p_config: parsed.data, p_reason: r }, z.number())
  invalidateCreditConfig()
  return version
}

// --- Ajustement manuel ---------------------------------------------------------------------------

export const adjustBodySchema = z.object({
  userId: z.string().uuid('Identifiant de compte invalide.'),
  wallet: z.enum(['monthly', 'purchased'], { message: 'Solde inconnu.' }),
  delta: z.number().int('Nombre entier attendu.').min(-1000).max(1000).refine((n) => n !== 0, 'Le montant ne peut pas être nul.'),
  reason: z.string().trim().min(5, 'Motif obligatoire (5 caractères au moins).').max(500),
  key: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, 'Clé d’idempotence invalide.'),
}).strict()

export type AdjustBody = z.infer<typeof adjustBodySchema>

const stateSchema = z.object({
  plan: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  monthly_quota: z.number(),
  monthly: z.number(),
  monthly_used: z.number(),
  purchased: z.number(),
  total: z.number(),
}).passthrough()

export async function adjustCredits(ctx: AdminCtx, body: AdjustBody): Promise<{ outcome: string; total: number | null }> {
  if (ctx.mode !== 'live') throw new RepoError('forbidden', 'Démonstration : aucun solde réel à ajuster.')
  const res = await rpc(ctx as LiveCtx, 'admin_credit_adjust', {
    p_user_id: body.userId, p_wallet: body.wallet, p_delta: body.delta, p_reason: body.reason, p_key: body.key,
  }, z.object({ outcome: z.enum(['adjusted', 'duplicate', 'insufficient']), balance: stateSchema.optional() }))
  if (res.outcome === 'insufficient') throw new RepoError('conflict', 'Solde insuffisant : un ajustement ne peut jamais rendre un solde négatif.')
  return { outcome: res.outcome, total: res.balance?.total ?? null }
}

export type UserCredits = z.infer<typeof stateSchema> & {
  ledger: Array<{ wallet: string; type: string; delta: number; amount: number; reason: string | null; at: string }>
}

export async function getUserCredits(ctx: AdminCtx, userId: string): Promise<UserCredits | null> {
  if (ctx.mode !== 'live' || !z.string().uuid().safeParse(userId).success) return null
  return rpc(ctx as LiveCtx, 'admin_credit_user', { p_user_id: userId }, stateSchema.extend({
    ledger: z.array(z.object({ wallet: z.string(), type: z.string(), delta: z.number(), amount: z.number(), reason: z.string().nullable(), at: z.string() })),
  })) as Promise<UserCredits>
}

// --- Tableau de bord -------------------------------------------------------------------------------

const num = z.union([z.number(), z.string()]).transform(Number)
const dashSchema = z.object({
  subscribers: z.record(z.number()),
  users_by_plan: z.record(z.number()),
  recharges: z.object({ count: z.number(), amount_cents: num, credits: z.number(), revoked: z.number() }),
  ledger: z.record(num),
  actions: z.array(z.object({
    action: z.string(), model: z.string(), succeeded: z.number(), released: z.number(), credits: z.number(),
    cost_eur: num, avg_cost_eur: num, p95_cost_eur: num, avg_input: num, avg_output: num, p95_latency_ms: num,
  })),
  cost_by_plan: z.record(num),
  failed_payments: z.number(),
  alerts: z.array(z.object({ scope: z.string(), day: z.string(), spent_eur: num, cap_eur: num })),
})

export type CreditDashboard = z.infer<typeof dashSchema> & {
  mrr: number
  arr: number
  /** Revenu mensuel estimé, coût IA mensualisé et marge par formule (estimations, hors taxes et frais). */
  margins: Array<{ plan: PlanId; revenue: number; aiCost: number; margin: number }>
  days: number
}

export async function getCreditDashboard(ctx: AdminCtx, days = 30): Promise<CreditDashboard | null> {
  if (ctx.mode !== 'live') return null
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  const d = await rpc(ctx as LiveCtx, 'admin_credit_dashboard', { p_from: from.toISOString(), p_to: to.toISOString() }, dashSchema)
  const { mrr, byPlan } = computeMrr(d.subscribers)
  const monthly = (x: number) => (x * 30) / days
  const margins = (['gratuit', 'premium', 'coparentalite'] as const).map((plan) => {
    const revenue = plan === 'gratuit' ? 0 : byPlan[plan]
    const aiCost = Math.round(monthly(Number(d.cost_by_plan[plan] ?? 0)) * 100) / 100
    return { plan, revenue, aiCost, margin: Math.round((revenue - aiCost) * 100) / 100 }
  })
  return { ...d, mrr, arr: Math.round(mrr * 12 * 100) / 100, margins, days }
}
