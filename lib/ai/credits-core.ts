// Crédits IA du Coach : logique PURE (tests/ai-credits.test.ts, tests/credits-v6.test.ts).
//  - ordre de consommation : crédits mensuels (solde A), puis crédits achetés (solde B) — miroir
//    simplifié de credits_reserve (0520) ; le portefeuille complet est dans ./wallet-core ;
//  - solde B : lots non expirés, expiration la plus proche ;
//  - achat : validation d'une session Stripe Checkout (aucune donnée de confiance côté client) et
//    crédit idempotent par identifiant de session (magasin injecté) ;
//  - démonstration : état simulé dans un cookie (aucun paiement, aucune base).
import {
  AI_CREDIT_CURRENCY,
  AI_CREDIT_VALIDITY_MONTHS,
  AI_CREDITS_KIND,
  creditExpiry,
  parseCreditPack,
  type CreditPack,
  type CreditPackId,
} from '@/lib/billing/credit-packs'

// --- Ordre quota → crédits ------------------------------------------------------------

export type ReservationSource = 'quota' | 'credit'

/**
 * Source principale d'une action de coût `cost` : solde mensuel (A) s'il couvre au moins une partie,
 * sinon crédits achetés (B), sinon refus (null). Le coût total doit être couvert par A + B.
 */
export function reservationSource(used: number, quota: number, credits: number, cost = 1): ReservationSource | null {
  const monthly = Math.max(0, quota - used)
  if (monthly + Math.max(0, credits) < cost) return null
  return monthly > 0 ? 'quota' : 'credit'
}

// --- Solde -------------------------------------------------------------------------------

export type CreditLot = { remaining: number; expiresAt: string; purchasedAt?: string }
export type CreditBalance = { balance: number; nextExpiry: string | null }

const time = (iso: string) => new Date(iso).getTime()

/** Lots utilisables (restant > 0, non expirés), du plus ancien (expiration la plus proche) au plus récent. */
export function usableLots<T extends CreditLot>(lots: readonly T[], now = Date.now()): T[] {
  return lots
    .filter((l) => l.remaining > 0 && time(l.expiresAt) > now)
    .sort((a, b) => time(a.expiresAt) - time(b.expiresAt) || time(a.purchasedAt ?? a.expiresAt) - time(b.purchasedAt ?? b.expiresAt))
}

export function creditBalance(lots: readonly CreditLot[], now = Date.now()): CreditBalance {
  const usable = usableLots(lots, now)
  return { balance: usable.reduce((n, l) => n + l.remaining, 0), nextExpiry: usable[0]?.expiresAt ?? null }
}

// --- Achat (Stripe Checkout) ---------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

/** Sous-ensemble de Stripe.Checkout.Session utilisé pour créditer un achat. */
export type CreditSessionLike = {
  id: string
  mode: string | null
  status: string | null
  payment_status: string | null
  client_reference_id: string | null
  amount_total: number | null
  currency: string | null
  created: number
  metadata: Record<string, string> | null
  payment_intent: string | { id: string } | null
}

export type CreditGrant = {
  userId: string
  /** Pack de la session : identifiant, quantité et prix FIGÉS à la création de la session (metadata). */
  pack: CreditPack
  amountCents: number
  currency: string
  sessionId: string
  paymentIntent: string | null
  purchasedAt: string
  waiverAt: string | null
}

export type GrantSkip = 'not_credits' | 'not_paid' | 'invalid'

/** Session d'achat de crédits ? (pour aiguiller le webhook sans rien valider d'autre). */
export function isCreditSession(s: Pick<CreditSessionLike, 'mode' | 'metadata'>): boolean {
  return s.mode === 'payment' && s.metadata?.kind === AI_CREDITS_KIND
}

/** Quantité et prix figés dans la session (metadata écrites par le serveur à la création). */
function sessionPack(meta: Record<string, string> | null): CreditPack | null {
  const id = meta?.pack ?? ''
  // `credits` (V6) ; `analyses` : sessions créées avant la V6 (même valeur, ancien nom).
  const credits = Number(meta?.credits ?? meta?.analyses)
  const priceCents = Number(meta?.price_cents)
  if (!/^[a-z0-9_]{1,32}$/.test(id) || !Number.isInteger(credits) || credits < 1 || credits > 1000) return null
  if (!Number.isInteger(priceCents) || priceCents < 0) return null
  return { id: id as CreditPackId, credits, priceCents }
}

/**
 * Valide une session Checkout payée et en déduit le crédit à accorder. Tout est recoupé côté
 * serveur : utilisateur (client_reference_id = metadata.user_id), pack, montant et devise.
 * Le montant payé est comparé au prix FIGÉ dans la session (un changement de tarif pendant sa
 * validité ne fait pas perdre un paiement) ; sessions antérieures sans prix figé : configuration
 * courante. Un montant incohérent n'est jamais crédité.
 */
export function creditGrantFromSession(s: CreditSessionLike): { ok: true; grant: CreditGrant } | { ok: false; reason: GrantSkip } {
  if (!isCreditSession(s)) return { ok: false, reason: 'not_credits' }
  if (s.status !== 'complete' || s.payment_status !== 'paid') return { ok: false, reason: 'not_paid' }
  const userId = s.client_reference_id
  const pack = s.metadata?.price_cents !== undefined ? sessionPack(s.metadata) : parseCreditPack(s.metadata?.pack)
  if (!SESSION_RE.test(s.id) || !userId || !UUID_RE.test(userId) || s.metadata?.user_id !== userId || !pack) return { ok: false, reason: 'invalid' }
  if (s.amount_total !== pack.priceCents || (s.currency ?? '').toLowerCase() !== AI_CREDIT_CURRENCY) return { ok: false, reason: 'invalid' }
  const waiver = Number(s.metadata?.waiver_at)
  const pi = s.payment_intent
  return {
    ok: true,
    grant: {
      userId,
      pack,
      amountCents: s.amount_total,
      currency: AI_CREDIT_CURRENCY,
      sessionId: s.id,
      paymentIntent: typeof pi === 'string' ? pi : pi?.id ?? null,
      purchasedAt: new Date(s.created * 1000).toISOString(),
      waiverAt: Number.isFinite(waiver) && waiver > 0 ? new Date(waiver * 1000).toISOString() : null,
    },
  }
}

export type GrantOutcome = 'granted' | 'duplicate' | 'unknown_user'

/** Écriture idempotente d'un achat (Supabase : grant_ai_credits ; tests : magasin mémoire). */
export type CreditStore = { grant(g: CreditGrant, validityMonths: number): Promise<GrantOutcome> }

/** Crédite une session (webhook ou retour de paiement). Rejouable : la même session ne crédite qu'une fois. */
export async function grantCreditsFromSession(
  store: CreditStore,
  s: CreditSessionLike,
  validityMonths: number = AI_CREDIT_VALIDITY_MONTHS,
): Promise<{ outcome: GrantOutcome | GrantSkip; grant?: CreditGrant }> {
  const parsed = creditGrantFromSession(s)
  if (!parsed.ok) return { outcome: parsed.reason }
  // Validité : figée dans la session à la création (affichée avant paiement), sinon configuration active.
  const frozen = Number(s.metadata?.validity_months)
  const months = Number.isInteger(frozen) && frozen >= 1 && frozen <= 36 ? frozen : validityMonths
  return { outcome: await store.grant(parsed.grant, months), grant: parsed.grant }
}

/** Magasin mémoire (tests) : unicité par session, comme l'index uq_ai_credits_session. */
export function memoryCreditStore(knownUsers: readonly string[]) {
  const lots = new Map<string, CreditGrant & { remaining: number; expiresAt: string }>()
  const store: CreditStore = {
    async grant(g, months) {
      if (!knownUsers.includes(g.userId)) return 'unknown_user'
      if (lots.has(g.sessionId)) return 'duplicate'
      lots.set(g.sessionId, { ...g, remaining: g.pack.credits, expiresAt: creditExpiry(new Date(g.purchasedAt), months).toISOString() })
      return 'granted'
    },
  }
  return { store, lots }
}

// --- Démonstration (cookie) ------------------------------------------------------------------

export const DEMO_AI_COOKIE = 'lp_demo_ai'
const DAY = 86_400_000
const MAX_LOTS = 12

/** État simulé : crédits mensuels consommés en démo (en plus du compteur du profil) et lots achetés. */
export type DemoAiState = { extraUsed: number; lots: Array<{ remaining: number; expiresDay: number }> }

export const emptyDemoAi = (): DemoAiState => ({ extraUsed: 0, lots: [] })

/** `3|10-21000,5-21100` : crédits mensuels consommés en plus | lots restant-jourExpiration. */
export function serializeDemoAi(s: DemoAiState): string {
  return `${s.extraUsed}|${s.lots.map((l) => `${l.remaining}-${l.expiresDay}`).join(',')}`
}

export function parseDemoAi(raw: string | null | undefined): DemoAiState | null {
  if (!raw) return null
  const m = /^(\d{1,4})\|((?:\d{1,4}-\d{1,6})(?:,\d{1,4}-\d{1,6}){0,11})?$/.exec(raw)
  if (!m) return null
  const lots = (m[2] ? m[2].split(',') : []).map((p) => {
    const [r, d] = p.split('-').map(Number)
    return { remaining: r, expiresDay: d }
  })
  return { extraUsed: Number(m[1]), lots }
}

export function demoAiLots(s: DemoAiState): CreditLot[] {
  return s.lots.map((l) => ({ remaining: l.remaining, expiresAt: new Date(l.expiresDay * DAY).toISOString() }))
}

/** Achat simulé : nouveau lot valable `months` mois (lots expirés ou vides retirés). */
export function demoAddCredits(s: DemoAiState, pack: CreditPack, now = Date.now(), months = AI_CREDIT_VALIDITY_MONTHS): DemoAiState {
  const expiresDay = Math.floor(creditExpiry(new Date(now), months).getTime() / DAY)
  const lots = s.lots.filter((l) => l.remaining > 0 && l.expiresDay * DAY > now)
  return { ...s, lots: [...lots, { remaining: pack.credits, expiresDay }].slice(-MAX_LOTS) }
}

/**
 * Réservation simulée (même ordre que la base : A puis B, lot qui expire le plus tôt d'abord) :
 * `baseUsed` = compteur du profil de démonstration, `cost` = coût de l'action en crédits.
 * Retourne la source principale et le nouvel état, ou null si A + B ne couvrent pas le coût.
 */
export function demoReserve(s: DemoAiState, baseUsed: number, quota: number, now = Date.now(), cost = 1): { source: ReservationSource; next: DemoAiState } | null {
  const used = baseUsed + s.extraUsed
  const lots = s.lots.map((l, i) => ({ ...l, i, expiresAt: new Date(l.expiresDay * DAY).toISOString() }))
  const source = reservationSource(used, quota, creditBalance(lots, now).balance, cost)
  if (!source) return null
  const fromMonthly = Math.min(Math.max(0, quota - used), cost)
  let rest = cost - fromMonthly
  const take = new Map<number, number>()
  for (const lot of usableLots(lots, now)) {
    if (rest === 0) break
    const n = Math.min(lot.remaining, rest)
    take.set(lot.i, n)
    rest -= n
  }
  return {
    source,
    next: {
      extraUsed: Math.min(9999, s.extraUsed + fromMonthly),
      lots: s.lots.map((l, i) => (take.has(i) ? { ...l, remaining: l.remaining - (take.get(i) as number) } : l)),
    },
  }
}

export type { CreditPackId }
