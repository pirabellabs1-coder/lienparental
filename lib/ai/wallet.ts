import 'server-only'
/**
 * Portefeuille de crédits IA (cahier V6), côté serveur. Logique pure : ./wallet-core (miroir de 0520).
 *
 * Trois magasins, choisis une fois pour toutes selon le déploiement :
 *  1. Supabase : fonctions SQL service_role (credits_reserve / _confirm / _release / _balance), sous
 *     verrou par compte. AUTORITÉ des soldes : le navigateur (et son cache PWA hors ligne) n'autorise
 *     jamais une action payante. Fail-closed : une base indisponible refuse l'action.
 *  2. Compte de DÉMONSTRATION sans clé d'IA : cookie lp_demo_ai (crédits simulés, aucun paiement).
 *  3. Sinon (développement local sans Supabase) : magasin mémoire du processus (MemoryWallet).
 * Les appels reçoivent TOUJOURS l'utilisateur de la session : jamais un identifiant venu du client
 * (un parent invité ne peut pas dépenser les crédits du titulaire, même en modifiant la requête).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CurrentUser } from '@/lib/auth/session'
import { AI_ENABLED, SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import { getDemoBilling } from '@/lib/billing/demo'
import { usage as demoProfileUsage } from '@/components/profil/data'
import type { PlanId } from '@/components/profil/pricing'
import { getCreditConfig } from './credit-config-server'
import { estimateCostEur, type CreditAction } from './credit-config'
import { readDemoAi, writeDemoAi } from './credits'
import { demoReserve, demoAiLots, creditBalance } from './credits-core'
import { LEDGER_TYPES, MemoryWallet, type LedgerType, type ReserveOutcome } from './wallet-core'

export type WalletView = {
  plan: PlanId
  periodStart: string
  periodEnd: string
  monthlyQuota: number
  /** Solde A (mensuel). */
  monthly: number
  monthlyUsed: number
  /** Solde B (acheté). */
  purchased: number
  total: number
  lots: Array<{ remaining: number; expiresAt: string; source?: string }>
  /** false : démonstration ou magasin mémoire (aucune donnée réelle). */
  live: boolean
}

export type Reservation =
  | { ok: true; actionId: string; cost: number; balance: WalletView }
  | { ok: false; reason: 'insufficient'; cost: number; balance: WalletView }
  | { ok: false; reason: 'duplicate'; status: string; actionId: string }
  | { ok: false; reason: 'inactive' | 'spend_cap' }

const db = () => createServiceClient() as unknown as SupabaseClient

// --- Magasin mémoire ------------------------------------------------------------------------

const g = globalThis as unknown as { __lpWallet?: MemoryWallet; __lpWalletSeen?: Map<string, string> }

async function memoryWallet(user: Pick<CurrentUser, 'id' | 'plan'>): Promise<MemoryWallet> {
  const { config } = await getCreditConfig()
  const w = (g.__lpWallet ??= new MemoryWallet(config))
  w.config = config
  const seen = (g.__lpWalletSeen ??= new Map())
  if (!seen.has(user.id)) seen.set(user.id, new Date().toISOString())
  const plan = (await getDemoBilling())?.plan ?? user.plan ?? 'gratuit'
  w.setUser(user.id, { plan, signupAt: seen.get(user.id)!, subscription: null })
  return w
}

const isDemoCookie = async () => !SUPABASE_ENABLED && !AI_ENABLED && !!(await readDemoAi())

// --- Lecture ---------------------------------------------------------------------------------

type SqlState = {
  plan: string
  period_start: string
  period_end: string
  monthly_quota: number
  monthly: number
  monthly_used: number
  purchased: number
  total: number
  lots: Array<{ remaining: number; expires_at: string; source?: string }>
}

function fromSql(s: SqlState): WalletView {
  const plan: PlanId = s.plan === 'premium' || s.plan === 'coparentalite' ? s.plan : 'gratuit'
  return {
    plan, periodStart: s.period_start, periodEnd: s.period_end, monthlyQuota: s.monthly_quota, monthly: s.monthly, monthlyUsed: s.monthly_used,
    purchased: s.purchased, total: s.total, lots: (s.lots ?? []).map((l) => ({ remaining: l.remaining, expiresAt: l.expires_at, source: l.source })), live: true,
  }
}

const DAY = 86_400_000

/** Démonstration (cookie) : compteur du profil de démo + consommation simulée. */
async function demoView(): Promise<WalletView> {
  const demo = await readDemoAi()
  const plan = (await getDemoBilling())?.plan ?? 'gratuit'
  const { config } = await getCreditConfig()
  const quota = config.monthlyCredits[plan]
  const used = Math.min(quota, (demoProfileUsage[plan]?.coachUsed ?? 0) + (demo?.state.extraUsed ?? 0))
  const lots = demo ? demoAiLots(demo.state) : []
  const purchased = creditBalance(lots).balance
  const now = Date.now()
  return {
    plan, periodStart: new Date(now - 10 * DAY).toISOString(), periodEnd: new Date(now + 20 * DAY).toISOString(), monthlyQuota: quota,
    monthly: quota - used, monthlyUsed: used, purchased, total: quota - used + purchased,
    lots: lots.filter((l) => l.remaining > 0 && Date.parse(l.expiresAt) > now).map((l) => ({ remaining: l.remaining, expiresAt: l.expiresAt })), live: false,
  }
}

/** Soldes A, B et A + B de l'utilisateur de la session. Erreur base → exception (aucune valeur inventée). */
export async function getWallet(user: Pick<CurrentUser, 'id' | 'plan'>): Promise<WalletView> {
  if (SUPABASE_ENABLED) {
    const { data, error } = await db().rpc('credits_balance', { p_user_id: user.id })
    if (error) throw new Error(`credits_balance failed: ${error.code ?? 'unknown'}`)
    return fromSql(data as SqlState)
  }
  if (await isDemoCookie()) return demoView()
  const w = await memoryWallet(user)
  const b = w.balance(user.id)
  return { ...b, periodStart: b.period.start, periodEnd: b.period.end, live: false }
}

// --- Réservation, confirmation, restitution ---------------------------------------------------

/**
 * Réserve le coût de `action` AVANT l'appel au modèle (clé d'idempotence fournie par le client).
 * Le coût vient de la configuration active, jamais du client.
 */
export async function reserveCredits(user: Pick<CurrentUser, 'id' | 'plan'>, action: CreditAction, key: string, analysisId?: string): Promise<Reservation> {
  if (SUPABASE_ENABLED) {
    const { data, error } = await db().rpc('credits_reserve', { p_user_id: user.id, p_action: action, p_key: key, p_analysis_id: analysisId ?? null })
    if (error) throw new Error(`credits_reserve failed: ${error.code ?? 'unknown'}`)
    const r = data as { outcome: string; action_id?: string; status?: string; cost?: number; balance?: SqlState; scope?: string }
    if (r.outcome === 'reserved') return { ok: true, actionId: r.action_id!, cost: r.cost!, balance: fromSql(r.balance!) }
    if (r.outcome === 'insufficient') return { ok: false, reason: 'insufficient', cost: r.cost!, balance: fromSql(r.balance!) }
    if (r.outcome === 'duplicate') return { ok: false, reason: 'duplicate', status: r.status ?? 'reserved', actionId: r.action_id! }
    if (r.outcome === 'spend_cap') {
      // Alerte d'exploitation : aucune donnée personnelle ni contenu (portée seulement).
      console.error('[credits] PLAFOND DE DÉPENSE IA ATTEINT', { scope: r.scope })
      return { ok: false, reason: 'spend_cap' }
    }
    return { ok: false, reason: 'inactive' }
  }

  const { config } = await getCreditConfig()
  const cost = config.actions[action]
  if (await isDemoCookie()) {
    if (!cost?.active) return { ok: false, reason: 'inactive' }
    const demo = (await readDemoAi())!
    const plan = (await getDemoBilling())?.plan ?? 'gratuit'
    const r = demoReserve(demo.state, demoProfileUsage[plan]?.coachUsed ?? 0, config.monthlyCredits[plan], Date.now(), cost.cost)
    if (!r) return { ok: false, reason: 'insufficient', cost: cost.cost, balance: await demoView() }
    await writeDemoAi(demo.account, r.next)
    return { ok: true, actionId: `demo_${key}`, cost: cost.cost, balance: await demoView() }
  }
  const w = await memoryWallet(user)
  const r: ReserveOutcome = w.reserve(user.id, action, key)
  const view = (b: ReturnType<MemoryWallet['balance']>): WalletView => ({ ...b, periodStart: b.period.start, periodEnd: b.period.end, live: false })
  if (r.outcome === 'reserved') return { ok: true, actionId: r.actionId, cost: r.cost, balance: view(r.balance) }
  if (r.outcome === 'insufficient') return { ok: false, reason: 'insufficient', cost: r.cost, balance: view(r.balance) }
  if (r.outcome === 'duplicate') return { ok: false, reason: 'duplicate', status: r.status, actionId: r.actionId }
  return { ok: false, reason: r.outcome }
}

export type CallUsage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Succès : débit confirmé une seule fois, coût fournisseur estimé enregistré (€, catalogue actif). */
export async function confirmCredits(user: Pick<CurrentUser, 'id' | 'plan'>, actionId: string, call: { model: string; usage?: CallUsage | null; latencyMs: number }): Promise<void> {
  if (actionId.startsWith('demo_')) return
  const { config } = await getCreditConfig()
  const costEur = estimateCostEur(config, call.model, call.usage)
  if (SUPABASE_ENABLED) {
    const u = call.usage ?? {}
    const args = {
      p_user_id: user.id, p_action_id: actionId, p_model: call.model.slice(0, 80),
      p_input: u.input_tokens ?? null, p_output: u.output_tokens ?? null,
      p_cache_write: u.cache_creation_input_tokens ?? null, p_cache_read: u.cache_read_input_tokens ?? null,
      p_cost_eur: costEur, p_latency_ms: Math.max(0, Math.round(call.latencyMs)),
    }
    // Un nouvel essai (idempotent : 'already' si le premier a abouti) avant de laisser la tâche
    // planifiée restituer la réservation d'une réponse pourtant livrée.
    let { data, error } = await db().rpc('credits_confirm', args)
    if (error) ({ data, error } = await db().rpc('credits_confirm', args))
    if (error) throw new Error(`credits_confirm failed: ${error.code ?? 'unknown'}`)
    // Réservation déjà restituée (délai dépassé) : réponse servie sans débit ; tracé pour le pilotage.
    if (data === 'not_reserved') console.warn('[credits] confirmation tardive : réservation déjà restituée', { action: actionId.slice(-8) })
    return
  }
  ;(await memoryWallet(user)).confirm(user.id, actionId, costEur)
}

/**
 * Échec, refus, annulation : crédits restitués. `call` : appel effectivement fait au fournisseur
 * (refus, sortie tronquée ou invalide, interruption) → son coût est conservé pour les plafonds de
 * dépense et le pilotage, sans débit de crédits. Ne lève jamais (trace exploitable sans contenu).
 */
export async function releaseCredits(
  user: Pick<CurrentUser, 'id' | 'plan'>,
  actionId: string,
  reason: 'failed' | 'refused' | 'aborted' | 'invalid_output' | 'empty' | 'truncated',
  call?: { model: string; usage?: CallUsage | null } | null,
): Promise<void> {
  if (actionId.startsWith('demo_')) return
  try {
    const costEur = call ? estimateCostEur((await getCreditConfig()).config, call.model, call.usage) : 0
    if (SUPABASE_ENABLED) {
      const { error } = await db().rpc('credits_release', {
        p_user_id: user.id, p_action_id: actionId, p_reason: reason,
        p_model: call?.model.slice(0, 80) ?? null, p_input: call?.usage?.input_tokens ?? null, p_output: call?.usage?.output_tokens ?? null,
        p_cost_eur: costEur,
      })
      if (error) throw new Error(error.code ?? 'unknown')
      return
    }
    ;(await memoryWallet(user)).release(user.id, actionId, reason, Date.now(), costEur)
  } catch (err) {
    // La tâche planifiée (credits_sweep) restituera la réservation à son échéance.
    console.error('[credits] restitution immédiate impossible', { action: actionId.slice(-8), msg: err instanceof Error ? err.message : 'unknown' })
  }
}

/** Tâche planifiée : restitue les réservations échues. */
export async function sweepCredits(): Promise<number> {
  if (!SUPABASE_ENABLED) return g.__lpWallet?.sweep() ?? 0
  const { data, error } = await db().rpc('credits_sweep', { p_limit: 500 })
  if (error) throw new Error(`credits_sweep failed: ${error.code ?? 'unknown'}`)
  return Number(data) || 0
}

// --- Historique -------------------------------------------------------------------------------

export type LedgerItem = { id: string; wallet: 'monthly' | 'purchased'; type: LedgerType; delta: number; amount: number; at: string }

export function parseLedgerFilter(v: unknown): LedgerType | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && (LEDGER_TYPES as readonly string[]).includes(s) ? (s as LedgerType) : null
}

/** Écritures du journal de l'utilisateur de la session (plus récentes d'abord), filtrables par type. */
export async function listLedger(user: Pick<CurrentUser, 'id' | 'plan'>, type: LedgerType | null, limit = 50): Promise<LedgerItem[]> {
  const n = Math.max(1, Math.min(limit, 200))
  if (SUPABASE_ENABLED) {
    let q = db().from('credit_ledger').select('id, wallet, entry_type, delta, amount, created_at').eq('user_id', user.id)
    if (type) q = q.eq('entry_type', type)
    const { data, error } = await q.order('id', { ascending: false }).limit(n)
    if (error) throw new Error(`credit_ledger read failed: ${error.code ?? 'unknown'}`)
    return ((data ?? []) as Array<{ id: number; wallet: 'monthly' | 'purchased'; entry_type: LedgerType; delta: number; amount: number; created_at: string }>)
      .map((r) => ({ id: String(r.id), wallet: r.wallet, type: r.entry_type, delta: r.delta, amount: r.amount, at: r.created_at }))
  }
  if (await isDemoCookie()) return []
  const w = await memoryWallet(user)
  return w.ledger.filter((e) => e.userId === user.id && (!type || e.type === type)).slice(-n).reverse()
    .map((e) => ({ id: String(e.id), wallet: e.wallet, type: e.type, delta: e.delta, amount: e.amount, at: e.at }))
}

// --- Achats et révocations ------------------------------------------------------------------

/** Remboursement total ou litige : solde restant des lots du paiement révoqué (idempotent). */
export async function revokeCreditsForPayment(paymentIntent: string, reason: 'refund' | 'dispute'): Promise<void> {
  const { data, error } = await db().rpc('credits_revoke_payment', { p_payment_intent: paymentIntent, p_reason: reason })
  if (error) throw new Error(`credits_revoke_payment failed: ${error.code ?? 'unknown'}`)
  if (Number(data) > 0) console.info('[ai-credits] crédits révoqués', { reason, pi: paymentIntent.slice(-8), lots: Number(data) })
}
