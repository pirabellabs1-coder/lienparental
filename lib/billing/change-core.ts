// Changement de formule d'un abonnement Stripe : règles et séquence d'appels.
// Module PUR : Stripe et la base sont injectés (fausse implémentation Stripe dans
// tests/billing.test.ts, y compris le cache d'idempotence de Stripe).
//
// Règles (cahier V6, validées ; affichées par lib/billing/ui-state.ts) :
//  - même niveau, autre cycle (mensuel ↔ annuel) : à la PROCHAINE échéance, sans prorata ;
//  - MONTÉE de niveau : IMMÉDIATE sur le cycle en cours, différence au prorata facturée et payée
//    tout de suite (les droits ne changent qu'après paiement confirmé) ; crédits IA : seule la
//    différence de crédits mensuels est allouée sur la période (credits_reserve, 0520) ; si le cycle
//    change aussi, la partie « cycle » est programmée à la prochaine échéance ;
//  - DESCENTE de niveau : à la PROCHAINE échéance (subscription schedule, proration_behavior
//    'none') : aucun remboursement du cycle en cours, droits actuels conservés jusqu'à cette date ;
//  - choisir à nouveau la formule actuelle annule un changement programmé.
// Jamais de confiance dans l'objet renvoyé par la mise à jour : l'abonnement est relu
// chez Stripe et le Price vérifié AVANT d'écrire en base.
import type { Cycle, Offer } from '@/components/profil/pricing'
import { planDirection } from './plans'
import type { UpsertResult } from './sync-core'

export type SubState = {
  id: string
  status: string
  cancel_at_period_end: boolean
  current_period_end: number
  /** Subscription schedule attaché (changement programmé), ou null. */
  schedule: string | null
  /** Dernière facture : rend la clé d'idempotence unique par période facturée. */
  latest_invoice: string | null
  item: { id: string; price: string } | null
}

export type ChangeDeps = {
  priceIdForOffer(offer: Offer): string | null
  offerFromPriceId(id: string): Offer | null
  retrieve(subId: string): Promise<SubState>
  /** Remplace le Price de l'élément ; lève une erreur Stripe en cas de refus de paiement. */
  updatePrice(sub: SubState, price: string, proration: 'always_invoice' | 'create_prorations', idempotencyKey: string): Promise<void>
  releaseSchedule(scheduleId: string): Promise<void>
  /** Programme `nextPrice` à la prochaine échéance (subscription schedule à deux phases). */
  scheduleNext(sub: SubState, currentPrice: string, nextPrice: string): Promise<void>
  /** Relit l'abonnement chez Stripe et l'écrit en base (même code que le webhook). */
  sync(subId: string): Promise<UpsertResult>
}

export type ChangePlanStatus = 'unchanged' | 'pending_change_canceled' | 'scheduled' | 'upgraded' | 'downgraded'
export type ChangeError = { ok: false; status: number; code: string; message: string }
export type ChangeResult =
  | { ok: true; status: ChangePlanStatus; offer: Offer; cycle: Cycle; effective_at: string | null; pending: Offer | null }
  | ChangeError

const err = (status: number, code: string, message: string): ChangeError => ({ ok: false, status, code, message })

/** Erreur Stripe de paiement (carte refusée, 3-D Secure requis) lors d'un changement immédiat. */
export function isPaymentError(e: unknown): boolean {
  const x = e as { type?: string; statusCode?: number } | null
  return !!x && (x.type === 'StripeCardError' || x.statusCode === 402)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Identifiant de requête fourni par le navigateur (UUID), ou null s'il est absent / invalide. */
export function parseRequestId(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null
}

export async function changePlanCore(deps: ChangeDeps, subId: string, offer: Offer, requestId: string): Promise<ChangeResult> {
  const target = deps.priceIdForOffer(offer)
  if (!target) return err(503, 'misconfigured', 'Service momentanément indisponible.')

  const sub = await deps.retrieve(subId)
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return err(409, 'subscription_not_active', 'Régularisez d’abord votre paiement pour changer de formule.')
  }
  if (sub.cancel_at_period_end) return err(409, 'cancel_pending', 'Annulez d’abord la résiliation pour changer de formule.')
  if (!sub.item) return err(409, 'no_subscription', 'Aucun abonnement en cours.')

  const currentPrice = sub.item.price
  const current = deps.offerFromPriceId(currentPrice)
  if (!current) return err(409, 'unknown_price', 'Formule actuelle inconnue. Contactez l’assistance.')
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
  const done = (status: ChangePlanStatus, effective_at: string | null, pending: Offer | null): ChangeResult =>
    ({ ok: true, status, offer, cycle: offer.cycle, effective_at, pending })

  if (target === currentPrice) {
    if (sub.schedule) {
      await deps.releaseSchedule(sub.schedule)
      return done('pending_change_canceled', null, null)
    }
    return done('unchanged', null, null)
  }

  const direction = planDirection(current.plan, offer.plan)

  // --- Même niveau, autre cycle, ou DESCENTE de niveau : à la prochaine échéance, sans prorata.
  if (direction === 'same' || direction === 'downgrade') {
    await deps.scheduleNext(sub, currentPrice, target)
    return done('scheduled', periodEnd, offer)
  }

  // --- Montée de niveau : immédiate, sur le cycle EN COURS.
  const immediate = deps.priceIdForOffer({ plan: offer.plan, cycle: current.cycle })
  if (!immediate) return err(503, 'misconfigured', 'Service momentanément indisponible.')
  if (sub.schedule) await deps.releaseSchedule(sub.schedule)

  // Clé unique par intention (requestId) ET par période facturée : un double clic est
  // dédupliqué, mais P → C → P → C ne rejoue jamais une réponse en cache.
  const key = `change-plan:${sub.id}:${sub.latest_invoice ?? 'none'}:${immediate}:${requestId}`
  try {
    await deps.updatePrice(sub, immediate, 'always_invoice', key)
  } catch (e) {
    if (isPaymentError(e)) {
      return err(402, 'payment_failed', 'Le paiement de la différence a été refusé. Vérifiez votre moyen de paiement puis réessayez.')
    }
    throw e
  }

  // Vérification : on relit chez Stripe, on n'écrit en base que l'état réel.
  const fresh = await deps.retrieve(sub.id)
  if (fresh.item?.price !== immediate) {
    await deps.sync(sub.id)
    return err(409, 'change_not_applied', 'Le changement n’a pas été appliqué. Rechargez la page puis réessayez.')
  }

  // Le cycle change aussi : programmé à la prochaine échéance.
  let pending: Offer | null = null
  if (offer.cycle !== current.cycle) {
    await deps.scheduleNext(fresh, immediate, target)
    pending = offer
  }
  await deps.sync(sub.id)
  return done('upgraded', new Date().toISOString(), pending)
}
