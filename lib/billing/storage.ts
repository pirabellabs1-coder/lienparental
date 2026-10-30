import 'server-only'
/**
 * Espace de stockage acheté, côté serveur (logique pure : ./storage-packs).
 * Lots public.storage_purchases (0610), accordés UNIQUEMENT par grant_storage_pack : webhook Stripe
 * ou relecture de la session chez Stripe au retour de paiement, idempotent par session.
 */
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { storageGrantFromSession, type StorageGrant, type StorageSessionLike } from './storage-packs'

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>; from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const serviceDb = () => createServiceClient() as unknown as Db

export type StorageGrantOutcome = 'granted' | 'duplicate' | 'unknown_user' | 'not_storage' | 'not_paid' | 'invalid' | 'reversed'

/** Accorde l'espace d'une session payée (webhook ou retour). Rejouable : une session n'accorde qu'une fois. */
export async function grantStorageForSession(session: StorageSessionLike, source: 'webhook' | 'return'): Promise<{ outcome: StorageGrantOutcome; grant?: StorageGrant }> {
  const v = storageGrantFromSession(session)
  const ref = session.id.slice(-8)
  if (!v.ok) {
    // Paiement encaissé mais incohérent : à traiter à la main (marqueur stable pour une alerte de logs).
    if (v.reason === 'invalid') console.error('[storage] PAIEMENT NON ACCORDÉ', { source, session: ref, paid: session.payment_status === 'paid' })
    if (v.reason === 'reversed') console.warn('[storage] paiement remboursé ou contesté : espace non accordé', { source, session: ref })
    return { outcome: v.reason }
  }
  const g = v.grant
  const { data, error } = await serviceDb().rpc('grant_storage_pack', {
    p_user_id: g.userId,
    p_pack: g.pack.id,
    p_gigabytes: g.pack.gigabytes,
    p_amount_cents: g.amountCents,
    p_currency: g.currency,
    p_session_id: g.sessionId,
    p_payment_intent: g.paymentIntent,
    p_purchased_at: g.purchasedAt,
    p_validity_months: g.validityMonths,
    p_waiver_at: g.waiverAt,
  })
  if (error) throw new Error(`grant_storage_pack failed: ${error.code ?? 'unknown'}`)
  const outcome = (data as { outcome?: string } | null)?.outcome
  if (outcome !== 'granted' && outcome !== 'duplicate' && outcome !== 'unknown_user') throw new Error('grant_storage_pack: unexpected result')
  if (outcome === 'granted') console.info('[storage] espace accordé', { source, session: ref, pack: g.pack.id })
  if (outcome === 'unknown_user') console.error('[storage] PAIEMENT NON ACCORDÉ', { source, session: ref, reason: outcome })
  return { outcome, grant: g }
}

/** Remboursement total ou litige : lots du paiement révoqués (idempotent). */
export async function revokeStorageForPayment(paymentIntent: string, reason: 'refund' | 'dispute'): Promise<void> {
  const { data, error } = await serviceDb().rpc('storage_revoke_payment', { p_payment_intent: paymentIntent, p_reason: reason })
  if (error) throw new Error(`storage_revoke_payment failed: ${error.code ?? 'unknown'}`)
  if (Number(data) > 0) console.info('[storage] espace révoqué', { reason, pi: paymentIntent.slice(-8), lots: Number(data) })
}

export type StorageLot = { gigabytes: number; expiresAt: string }

/** Packs actifs de l'utilisateur connecté (RLS : ses propres lignes), expiration la plus proche d'abord. */
export async function listActiveStoragePacks(): Promise<StorageLot[]> {
  if (!SUPABASE_ENABLED) return []
  try {
    const db = (await createClient()) as unknown as Db
    const { data, error } = await db.from('storage_purchases').select('gigabytes, expires_at').is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: true }).limit(50)
    if (error) return []
    return ((data ?? []) as { gigabytes: number; expires_at: string }[]).map((l) => ({ gigabytes: l.gigabytes, expiresAt: l.expires_at }))
  } catch {
    return []
  }
}
