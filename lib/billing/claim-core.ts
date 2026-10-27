// Idempotence des webhooks Stripe (table stripe_events) : logique PURE, stockage injecté.
// Stripe livre « au moins une fois », parfois en double et en parallèle.

export type Claim = 'claimed' | 'done' | 'in_flight'
export const STALE_CLAIM_MS = 2 * 60_000

export interface EventStore {
  /** Insère la réclamation ; 'duplicate' si l'événement existe déjà. */
  insert(id: string, type: string): Promise<'ok' | 'duplicate'>
  get(id: string): Promise<{ processed_at: string | null; received_at: string } | null>
  /** Reprise atomique d'une réclamation abandonnée (compare-and-set sur received_at). */
  takeOver(id: string, expectedReceivedAt: string, nowIso: string): Promise<boolean>
}

/**
 *  - 'claimed'   : à traiter maintenant ;
 *  - 'done'      : déjà traité → 200 sans rien refaire ;
 *  - 'in_flight' : une autre livraison le traite → l'appelant renvoie 409, Stripe relivrera.
 * Une réclamation sans traitement depuis plus de STALE_CLAIM_MS (crash) est reprise.
 */
export async function claimEventWith(store: EventStore, event: { id: string; type: string }, now = Date.now()): Promise<Claim> {
  if ((await store.insert(event.id, event.type)) === 'ok') return 'claimed'
  const row = await store.get(event.id)
  if (!row || row.processed_at) return 'done'
  if (now - Date.parse(row.received_at) < STALE_CLAIM_MS) return 'in_flight'
  return (await store.takeOver(event.id, row.received_at, new Date(now).toISOString())) ? 'claimed' : 'in_flight'
}
