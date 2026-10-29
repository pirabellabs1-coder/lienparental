// Portefeuille de crédits IA (cahier V6) : logique PURE, miroir exact des fonctions SQL de 0520
// (credits_reserve, credits_confirm, credits_release, credits_sweep, credits_balance,
// grant_ai_credits, credits_revoke_payment, admin_credit_adjust). Testée dans tests/credits-v6.test.ts ;
// la base (verrou consultatif, FOR UPDATE, RLS, journal immuable) l'est par
// tests/sql/scenarios/0520-credits-v6.test.mjs. Sert aussi de magasin en démonstration (sans Supabase).
//
// Règles :
//  - Deux soldes : A (mensuel, inclus dans la formule PROPRE du compte) et B (lots achetés).
//    Affichés A, B et A+B. Débit : A d'abord, puis B (lot qui expire le plus tôt d'abord).
//  - A : période mensuelle ancrée sur current_period_start de l'abonnement (annuel : une allocation
//    à chaque mois du cycle, jamais 12 d'un coup) ; Gratuit : ancrée sur la date d'inscription.
//    Allocation paresseuse et idempotente (clé = période + quota cible) ; aucun report : à la
//    période suivante, le reliquat est journalisé « expiration ».
//  - Montée en gamme sur la même période : solde A = quota du nouveau plan − consommé sur la période
//    (allocation de la seule différence positive, une fois). Descente : à l'échéance (Stripe).
//  - Réservation AVANT l'appel IA, confirmation au succès, restitution en cas d'échec ou de délai
//    dépassé. Clé d'idempotence fournie par le client : rejouée = aucun second débit.
//  - Jamais de solde négatif. Journal en ajout seul (aucune modification ni suppression).
//  - Non mutualisé : un compte ne consomme QUE ses propres soldes (plan propre, jamais le plan
//    « effectif » apporté par un parent lié en Coparentalité+).
import type { PlanId } from '@/components/profil/pricing'
import type { CreditAction, CreditConfig } from './credit-config'

// --- Périodes -----------------------------------------------------------------------------------

/** anchor + k mois calendaires en UTC, jour borné à la fin du mois (comme PostgreSQL `+ interval`). */
export function addMonthsUtc(anchor: Date, k: number): Date {
  const y = anchor.getUTCFullYear()
  const m = anchor.getUTCMonth() + k
  const target = new Date(Date.UTC(y, m, 1, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(anchor.getUTCDate(), last))
  return target
}

/** Plus grand k ≥ 0 tel que anchor + k mois ≤ now. */
export function monthsElapsed(anchor: Date, now: number): number {
  let k = Math.max(0, (new Date(now).getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (new Date(now).getUTCMonth() - anchor.getUTCMonth()))
  while (k > 0 && addMonthsUtc(anchor, k).getTime() > now) k--
  while (addMonthsUtc(anchor, k + 1).getTime() <= now) k++
  return k
}

export type PeriodSource = {
  /** Formule PROPRE (users.plan), jamais le plan effectif familial. */
  plan: PlanId
  signupAt: string
  subscription: { start: string | null; end: string | null } | null
}

export type CreditPeriod = { start: string; end: string; anchor: 'subscription' | 'signup' }

/**
 * Période mensuelle courante du solde A.
 *  - Formule payante avec abonnement : base = current_period_start (ou current_period_end si la
 *    période est échue et le webhook de renouvellement pas encore traité : Stripe démarre la
 *    période suivante EXACTEMENT à cet instant, la clé de période ne change donc pas au webhook).
 *    Sous-période = base + k mois, bornée par current_period_end.
 *  - Sinon (Gratuit) : base = date d'inscription, période = inscription + k mois.
 */
export function creditPeriod(src: PeriodSource, now = Date.now()): CreditPeriod {
  const sub = src.plan !== 'gratuit' ? src.subscription : null
  if (sub?.start) {
    const end = sub.end ? Date.parse(sub.end) : NaN
    const base = new Date(Number.isFinite(end) && now >= end ? end : Date.parse(sub.start))
    const k = monthsElapsed(base, now)
    const start = addMonthsUtc(base, k)
    let next = addMonthsUtc(base, k + 1).getTime()
    if (Number.isFinite(end) && now < end && next > end) next = end
    return { start: start.toISOString(), end: new Date(next).toISOString(), anchor: 'subscription' }
  }
  const base = new Date(Date.parse(src.signupAt))
  const k = monthsElapsed(base, now)
  return { start: addMonthsUtc(base, k).toISOString(), end: addMonthsUtc(base, k + 1).toISOString(), anchor: 'signup' }
}

// --- Débit ---------------------------------------------------------------------------------------

export type LotLike = { id: string; remaining: number; expiresAt: string; purchasedAt: string; revokedAt?: string | null }

/** Lots utilisables : restant > 0, non expirés, non révoqués ; expiration la plus proche d'abord. */
export function usableLotsV6<T extends LotLike>(lots: readonly T[], now = Date.now()): T[] {
  return lots
    .filter((l) => l.remaining > 0 && !l.revokedAt && Date.parse(l.expiresAt) > now)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt) || Date.parse(a.purchasedAt) - Date.parse(b.purchasedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export type DebitSplit = { monthly: number; lots: Array<{ lotId: string; n: number }> }

/** Répartition d'un coût : solde A d'abord, puis les lots dans l'ordre donné ; null si insuffisant. */
export function splitDebit(cost: number, monthly: number, lots: readonly { id: string; remaining: number }[]): DebitSplit | null {
  if (!Number.isInteger(cost) || cost < 0) return null
  const fromMonthly = Math.min(Math.max(0, monthly), cost)
  let rest = cost - fromMonthly
  const parts: DebitSplit['lots'] = []
  for (const l of lots) {
    if (rest === 0) break
    const n = Math.min(l.remaining, rest)
    if (n > 0) parts.push({ lotId: l.id, n })
    rest -= n
  }
  return rest === 0 ? { monthly: fromMonthly, lots: parts } : null
}

// --- Clé d'idempotence --------------------------------------------------------------------------

const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/

/** Clé d'idempotence d'une entrée non fiable (en-tête Idempotency-Key / champ), ou null. */
export function parseIdempotencyKey(v: unknown): string | null {
  return typeof v === 'string' && KEY_RE.test(v.trim()) ? v.trim() : null
}

// --- Magasin mémoire (tests, démonstration) ------------------------------------------------------

export const LEDGER_TYPES = ['allocation', 'reservation', 'consumption', 'release', 'purchase', 'revocation', 'expiration', 'admin_adjustment'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]
export type Wallet = 'monthly' | 'purchased'

export type LedgerEntry = {
  id: number
  userId: string
  wallet: Wallet
  type: LedgerType
  /** Effet sur le solde (négatif = débit). La consommation vaut 0 : le débit a eu lieu à la réservation. */
  delta: number
  /** Crédits concernés (valeur absolue), pour l'historique. */
  amount: number
  lotId: string | null
  actionId: string | null
  periodStart: string | null
  key: string
  reason: string | null
  adminId: string | null
  at: string
}

export type ActionStatus = 'reserved' | 'succeeded' | 'released'

export type ActionRow = {
  id: string
  userId: string
  actionType: CreditAction
  credits: number
  monthlyPart: number
  lotParts: Array<{ lotId: string; n: number }>
  status: ActionStatus
  key: string
  periodStart: string
  reservedAt: string
  expiresAt: string
  costEur: number
}

export type LotRow = LotLike & {
  userId: string
  quantity: number
  sessionId: string | null
  paymentIntent: string | null
  source: 'stripe' | 'admin'
  revokedAt: string | null
}

export type WalletBalance = {
  plan: PlanId
  period: CreditPeriod
  monthlyQuota: number
  /** Solde A. */
  monthly: number
  /** Crédits du solde A consommés ou réservés sur la période. */
  monthlyUsed: number
  /** Solde B. */
  purchased: number
  total: number
  /** Lots utilisables (expiration la plus proche d'abord). */
  lots: Array<{ id: string; remaining: number; expiresAt: string }>
}

export type ReserveOutcome =
  | { outcome: 'reserved'; actionId: string; cost: number; monthlyPart: number; purchasedPart: number; balance: WalletBalance }
  | { outcome: 'duplicate'; actionId: string; status: ActionStatus }
  | { outcome: 'insufficient'; cost: number; balance: WalletBalance }
  | { outcome: 'inactive' }
  | { outcome: 'spend_cap'; scope: 'user' | 'global' }

export type AdjustOutcome = 'adjusted' | 'duplicate' | 'insufficient' | 'invalid'

/** Marge ajoutée au délai de l'action avant qu'une réservation orpheline soit restituée. */
export const RESERVATION_MARGIN_MS = 60_000

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10)

export class MemoryWallet {
  readonly ledger: LedgerEntry[] = []
  readonly lots: LotRow[] = []
  readonly actions: ActionRow[] = []
  readonly alerts: Array<{ scope: 'user' | 'global'; day: string; userId: string | null }> = []
  private readonly users = new Map<string, PeriodSource>()
  private seq = 0

  constructor(public config: CreditConfig, private readonly newId: () => string = () => crypto.randomUUID()) {}

  setUser(userId: string, src: PeriodSource): void {
    this.users.set(userId, src)
  }

  private user(userId: string): PeriodSource {
    const u = this.users.get(userId)
    if (!u) throw new Error('unknown user')
    return u
  }

  private write(e: Omit<LedgerEntry, 'id' | 'at'>, now: number): boolean {
    if (this.ledger.some((x) => x.key === e.key)) return false // idempotency_key unique
    this.ledger.push({ ...e, id: ++this.seq, at: new Date(now).toISOString() })
    return true
  }

  private monthlySum(userId: string, periodStart: string): number {
    return this.ledger.filter((e) => e.userId === userId && e.wallet === 'monthly' && e.periodStart === periodStart).reduce((n, e) => n + e.delta, 0)
  }

  /** Allocation, expirations (mois écoulés, lots échus) et restitution des réservations échues. */
  sync(userId: string, now = Date.now()): CreditPeriod {
    for (const a of this.actions) if (a.userId === userId && a.status === 'reserved' && Date.parse(a.expiresAt) <= now) this.release(userId, a.id, 'timeout', now)
    const src = this.user(userId)
    const period = creditPeriod(src, now)
    const quota = this.config.monthlyCredits[src.plan] ?? 0
    const allocated = this.ledger
      .filter((e) => e.userId === userId && e.wallet === 'monthly' && e.type === 'allocation' && e.periodStart === period.start)
      .reduce((n, e) => n + e.delta, 0)
    if (quota > allocated) {
      this.write({ userId, wallet: 'monthly', type: 'allocation', delta: quota - allocated, amount: quota - allocated, lotId: null, actionId: null, periodStart: period.start, key: `alloc:${userId}:${Date.parse(period.start)}:${quota}`, reason: null, adminId: null }, now)
    }
    // Aucun report : reliquat des périodes passées expiré.
    const past = new Set(this.ledger.filter((e) => e.userId === userId && e.wallet === 'monthly' && e.periodStart && e.periodStart < period.start).map((e) => e.periodStart as string))
    for (const p of past) {
      const left = this.monthlySum(userId, p)
      if (left > 0) {
        const n = this.ledger.filter((e) => e.userId === userId && e.type === 'expiration' && e.periodStart === p).length
        this.write({ userId, wallet: 'monthly', type: 'expiration', delta: -left, amount: left, lotId: null, actionId: null, periodStart: p, key: `expire_m:${userId}:${Date.parse(p)}:${n}`, reason: null, adminId: null }, now)
      }
    }
    for (const l of this.lots) {
      if (l.userId !== userId || l.revokedAt || l.remaining <= 0 || Date.parse(l.expiresAt) > now) continue
      const n = this.ledger.filter((e) => e.type === 'expiration' && e.lotId === l.id).length
      this.write({ userId, wallet: 'purchased', type: 'expiration', delta: -l.remaining, amount: l.remaining, lotId: l.id, actionId: null, periodStart: null, key: `expire_l:${l.id}:${n}`, reason: null, adminId: null }, now)
      l.remaining = 0
    }
    return period
  }

  balance(userId: string, now = Date.now()): WalletBalance {
    const period = this.sync(userId, now)
    const src = this.user(userId)
    const monthlyQuota = this.config.monthlyCredits[src.plan] ?? 0
    const monthly = Math.max(0, this.monthlySum(userId, period.start))
    const allocated = this.ledger
      .filter((e) => e.userId === userId && e.wallet === 'monthly' && e.periodStart === period.start && (e.type === 'allocation' || e.type === 'admin_adjustment'))
      .reduce((n, e) => n + e.delta, 0)
    const usable = usableLotsV6(this.lots.filter((l) => l.userId === userId), now)
    const purchased = usable.reduce((n, l) => n + l.remaining, 0)
    return {
      plan: src.plan, period, monthlyQuota, monthly, monthlyUsed: Math.max(0, allocated - monthly), purchased, total: monthly + purchased,
      lots: usable.map((l) => ({ id: l.id, remaining: l.remaining, expiresAt: l.expiresAt })),
    }
  }

  reserve(userId: string, action: CreditAction, key: string, now = Date.now()): ReserveOutcome {
    const dup = this.actions.find((a) => a.userId === userId && a.key === key)
    if (dup) return { outcome: 'duplicate', actionId: dup.id, status: dup.status }
    const cfg = this.config.actions[action]
    if (!cfg?.active) return { outcome: 'inactive' }
    const day = utcDay(now)
    const spent = (pred: (a: ActionRow) => boolean) => this.actions.filter((a) => utcDay(Date.parse(a.reservedAt)) === day && pred(a)).reduce((n, a) => n + a.costEur, 0)
    const capUser = this.config.limits.dailySpendEurUser
    const capGlobal = this.config.limits.dailySpendEurGlobal
    if (capGlobal > 0 && spent(() => true) >= capGlobal) return this.alert('global', day, null)
    if (capUser > 0 && spent((a) => a.userId === userId) >= capUser) return this.alert('user', day, userId)

    const balance = this.balance(userId, now)
    const lots = usableLotsV6(this.lots.filter((l) => l.userId === userId), now)
    const split = splitDebit(cfg.cost, balance.monthly, lots)
    if (!split) return { outcome: 'insufficient', cost: cfg.cost, balance }

    const id = this.newId()
    if (split.monthly > 0) this.write({ userId, wallet: 'monthly', type: 'reservation', delta: -split.monthly, amount: split.monthly, lotId: null, actionId: id, periodStart: balance.period.start, key: `res:${id}:m`, reason: null, adminId: null }, now)
    for (const p of split.lots) {
      const lot = this.lots.find((l) => l.id === p.lotId)!
      lot.remaining -= p.n
      this.write({ userId, wallet: 'purchased', type: 'reservation', delta: -p.n, amount: p.n, lotId: p.lotId, actionId: id, periodStart: null, key: `res:${id}:${p.lotId}`, reason: null, adminId: null }, now)
    }
    this.actions.push({
      id, userId, actionType: action, credits: cfg.cost, monthlyPart: split.monthly, lotParts: split.lots, status: 'reserved', key,
      periodStart: balance.period.start, reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + cfg.timeoutMs + RESERVATION_MARGIN_MS).toISOString(), costEur: 0,
    })
    return { outcome: 'reserved', actionId: id, cost: cfg.cost, monthlyPart: split.monthly, purchasedPart: cfg.cost - split.monthly, balance: this.balance(userId, now) }
  }

  private alert(scope: 'user' | 'global', day: string, userId: string | null): ReserveOutcome {
    if (!this.alerts.some((a) => a.scope === scope && a.day === day && a.userId === userId)) this.alerts.push({ scope, day, userId })
    return { outcome: 'spend_cap', scope }
  }

  /** Succès de l'action : débit confirmé une seule fois ('confirmed' | 'already' | 'not_reserved'). */
  confirm(userId: string, actionId: string, costEur = 0, now = Date.now()): 'confirmed' | 'already' | 'not_reserved' {
    const a = this.actions.find((x) => x.id === actionId && x.userId === userId)
    if (!a) return 'not_reserved'
    if (a.status === 'succeeded') return 'already'
    if (a.status !== 'reserved') return 'not_reserved'
    a.status = 'succeeded'
    a.costEur = costEur
    if (a.monthlyPart > 0) this.write({ userId, wallet: 'monthly', type: 'consumption', delta: 0, amount: a.monthlyPart, lotId: null, actionId, periodStart: a.periodStart, key: `con:${actionId}:m`, reason: null, adminId: null }, now)
    for (const p of a.lotParts) this.write({ userId, wallet: 'purchased', type: 'consumption', delta: 0, amount: p.n, lotId: p.lotId, actionId, periodStart: null, key: `con:${actionId}:${p.lotId}`, reason: null, adminId: null }, now)
    return 'confirmed'
  }

  /**
   * Échec, refus, délai dépassé : crédits restitués ('released' | 'not_reserved'). Le coût fournisseur
   * éventuel (appel effectué puis refusé, tronqué, interrompu) est conservé pour les plafonds.
   */
  release(userId: string, actionId: string, reason: string, now = Date.now(), costEur = 0): 'released' | 'not_reserved' {
    const a = this.actions.find((x) => x.id === actionId && x.userId === userId)
    if (!a || a.status !== 'reserved') return 'not_reserved'
    a.status = 'released'
    a.costEur = Math.max(0, costEur)
    if (a.monthlyPart > 0) this.write({ userId, wallet: 'monthly', type: 'release', delta: a.monthlyPart, amount: a.monthlyPart, lotId: null, actionId, periodStart: a.periodStart, key: `rel:${actionId}:m`, reason, adminId: null }, now)
    for (const p of a.lotParts) {
      const lot = this.lots.find((l) => l.id === p.lotId)
      if (!lot || lot.revokedAt) continue // lot remboursé ou contesté entre-temps : rien à rendre
      lot.remaining = Math.min(lot.quantity, lot.remaining + p.n)
      this.write({ userId, wallet: 'purchased', type: 'release', delta: p.n, amount: p.n, lotId: p.lotId, actionId, periodStart: null, key: `rel:${actionId}:${p.lotId}`, reason, adminId: null }, now)
    }
    return 'released'
  }

  /** Restitue toutes les réservations échues (tâche planifiée). */
  sweep(now = Date.now()): number {
    let n = 0
    for (const a of this.actions) if (a.status === 'reserved' && Date.parse(a.expiresAt) <= now && this.release(a.userId, a.id, 'timeout', now) === 'released') n++
    return n
  }

  /** Achat confirmé par le serveur : lot + écriture « purchase », une seule fois par session. */
  grant(userId: string, g: { sessionId: string; credits: number; paymentIntent: string | null; purchasedAt: string }, now = Date.now()): 'granted' | 'duplicate' | 'unknown_user' {
    if (!this.users.has(userId)) return 'unknown_user'
    if (this.lots.some((l) => l.sessionId === g.sessionId)) return 'duplicate'
    const id = this.newId()
    const expiresAt = addMonthsUtc(new Date(g.purchasedAt), this.config.purchasedValidityMonths).toISOString()
    this.lots.push({ id, userId, quantity: g.credits, remaining: g.credits, purchasedAt: g.purchasedAt, expiresAt, sessionId: g.sessionId, paymentIntent: g.paymentIntent, source: 'stripe', revokedAt: null })
    this.write({ userId, wallet: 'purchased', type: 'purchase', delta: g.credits, amount: g.credits, lotId: id, actionId: null, periodStart: null, key: `purchase:${g.sessionId}`, reason: null, adminId: null }, now)
    return 'granted'
  }

  /** Remboursement total ou litige : solde restant des lots du paiement révoqué. */
  revokePayment(paymentIntent: string, reason: 'refund' | 'dispute', now = Date.now()): number {
    let n = 0
    for (const l of this.lots) {
      if (l.paymentIntent !== paymentIntent || l.revokedAt) continue
      this.write({ userId: l.userId, wallet: 'purchased', type: 'revocation', delta: -l.remaining, amount: l.remaining, lotId: l.id, actionId: null, periodStart: null, key: `revoke:${l.id}`, reason, adminId: null }, now)
      l.remaining = 0
      l.revokedAt = new Date(now).toISOString()
      n++
    }
    return n
  }

  /** Ajustement manuel (motif obligatoire), jamais en dessous de zéro. */
  adjust(adminId: string, userId: string, wallet: Wallet, delta: number, reason: string, key: string, now = Date.now()): AdjustOutcome {
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000 || reason.trim().length < 5 || !this.users.has(userId)) return 'invalid'
    if (this.ledger.some((e) => e.key === `adjust:${key}`)) return 'duplicate'
    const bal = this.balance(userId, now)
    const base = { userId, type: 'admin_adjustment' as const, reason: reason.trim(), adminId, actionId: null }
    if (wallet === 'monthly') {
      if (bal.monthly + delta < 0) return 'insufficient'
      this.write({ ...base, wallet, delta, amount: Math.abs(delta), lotId: null, periodStart: bal.period.start, key: `adjust:${key}` }, now)
      return 'adjusted'
    }
    if (delta > 0) {
      const id = this.newId()
      const at = new Date(now).toISOString()
      this.lots.push({ id, userId, quantity: delta, remaining: delta, purchasedAt: at, expiresAt: addMonthsUtc(new Date(now), this.config.purchasedValidityMonths).toISOString(), sessionId: null, paymentIntent: null, source: 'admin', revokedAt: null })
      this.write({ ...base, wallet, delta, amount: delta, lotId: id, periodStart: null, key: `adjust:${key}` }, now)
      return 'adjusted'
    }
    const split = splitDebit(-delta, 0, usableLotsV6(this.lots.filter((l) => l.userId === userId), now))
    if (!split) return 'insufficient'
    split.lots.forEach((p, i) => {
      this.lots.find((l) => l.id === p.lotId)!.remaining -= p.n
      // Première ligne : clé exacte (détection de doublon par égalité, comme admin_credit_adjust).
      this.write({ ...base, wallet, delta: -p.n, amount: p.n, lotId: p.lotId, periodStart: null, key: i === 0 ? `adjust:${key}` : `adjust:${key}:${p.lotId}` }, now)
    })
    return 'adjusted'
  }
}
