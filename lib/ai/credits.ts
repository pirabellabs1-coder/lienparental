import 'server-only'
/**
 * Crédits d'analyses du Coach IA, côté serveur (logique pure : ./credits-core).
 *
 * - Supabase : registre public.ai_credits (0510), lu en service_role filtré sur l'utilisateur de la
 *   session ; crédité UNIQUEMENT par grant_ai_credits (webhook Stripe ou retour de paiement, idempotent
 *   par session) ; consommé par reserve_ai_analysis (lib/ai/quota.ts), rendu par release_ai_usage.
 * - Démonstration (sans Supabase) : état simulé dans le cookie lp_demo_ai, lié au compte de démo.
 * Une lecture impossible (migration 0510 non appliquée, base indisponible) affiche un solde nul :
 * jamais une valeur inventée, et l'analyse retombe sur le seul quota.
 */
import { cookies } from 'next/headers'
import type { CurrentUser } from '@/lib/auth/session'
import { DEMO_COOKIE, isDemoAccountId } from '@/lib/demo-auth'
import { DEMO_BILLING, getDemoBilling } from '@/lib/billing/demo'
import { DEMO_BILLING_MAX_AGE } from '@/lib/billing/demo-core'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { usage as demoProfileUsage } from '@/components/profil/data'
import { COACH_ANALYSES, type PlanId } from '@/components/profil/pricing'
import { aiServiceDb } from './analyses'
import {
  DEMO_AI_COOKIE,
  creditBalance,
  demoAiLots,
  emptyDemoAi,
  grantCreditsFromSession,
  parseDemoAi,
  serializeDemoAi,
  type CreditBalance,
  type CreditSessionLike,
  type CreditStore,
  type DemoAiState,
  type GrantOutcome,
} from './credits-core'

// --- Solde -------------------------------------------------------------------------------

type LotRow = { remaining: number; expires_at: string; purchased_at: string }

/** Solde de l'utilisateur (Supabase) ou du compte de démonstration courant (`user` ignoré sans Supabase). */
export async function getCreditBalance(user: Pick<CurrentUser, 'id'> | null): Promise<CreditBalance> {
  if (SUPABASE_ENABLED) {
    if (!user) return { balance: 0, nextExpiry: null }
    try {
      const { data, error } = await aiServiceDb()
        .from('ai_credits')
        .select('remaining, expires_at, purchased_at')
        .eq('user_id', user.id)
        .gt('remaining', 0)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true })
        .limit(500)
      if (error) throw new Error(error.code ?? 'ai_credits_read_failed')
      return creditBalance(((data ?? []) as LotRow[]).map((r) => ({ remaining: r.remaining, expiresAt: r.expires_at, purchasedAt: r.purchased_at })))
    } catch (err) {
      console.warn('[ai-credits] solde indisponible', err instanceof Error ? err.message : 'unknown')
      return { balance: 0, nextExpiry: null }
    }
  }
  const demo = await readDemoAi()
  return demo ? creditBalance(demoAiLots(demo.state)) : { balance: 0, nextExpiry: null }
}

// --- Achat --------------------------------------------------------------------------------

const supabaseStore: CreditStore = {
  async grant(g, validityMonths) {
    const { data, error } = await aiServiceDb().rpc('grant_ai_credits', {
      p_user_id: g.userId,
      p_pack: g.pack.id,
      p_quantity: g.pack.analyses,
      p_amount_cents: g.amountCents,
      p_currency: g.currency,
      p_session_id: g.sessionId,
      p_payment_intent: g.paymentIntent,
      p_purchased_at: g.purchasedAt,
      p_validity_months: validityMonths,
      p_waiver_at: g.waiverAt,
    })
    if (error) throw new Error(`grant_ai_credits failed: ${error.code ?? 'unknown'}`)
    const outcome = (data as { outcome?: string } | null)?.outcome
    if (outcome === 'granted' || outcome === 'duplicate' || outcome === 'unknown_user') return outcome as GrantOutcome
    throw new Error('grant_ai_credits: unexpected result')
  },
}

/**
 * Crédite une session Checkout payée (webhook ou retour de paiement). Idempotent (session unique).
 * Journalise le résultat sans donnée personnelle ni identifiant Stripe complet.
 */
export async function grantCreditsForSession(session: CreditSessionLike, source: 'webhook' | 'return') {
  const res = await grantCreditsFromSession(supabaseStore, session)
  const ref = session.id.slice(-8)
  if (res.outcome === 'granted') console.info('[ai-credits] achat crédité', { source, session: ref, pack: res.grant?.pack.id })
  // Paiement encaissé mais non crédité (session incohérente, compte inconnu) : à traiter à la main
  // (crédit ou remboursement depuis le Dashboard Stripe). Marqueur stable pour une alerte de logs.
  else if (res.outcome !== 'duplicate' && res.outcome !== 'not_paid' && res.outcome !== 'not_credits') {
    console.error('[ai-credits] PAIEMENT NON CRÉDITÉ', { source, session: ref, reason: res.outcome, paid: session.payment_status === 'paid' })
  }
  return res
}

/**
 * Révoque le solde restant des lots payés par ce PaymentIntent (remboursement total ou litige).
 * Idempotent ; aucun lot (abonnement, paiement inconnu) = sans effet. Erreur base → exception :
 * le webhook répond 500 et Stripe relivre l'événement.
 */
export async function revokeCreditsForPayment(paymentIntent: string, reason: 'refund' | 'dispute') {
  const { data, error } = await aiServiceDb()
    .from('ai_credits')
    .update({ remaining: 0 })
    .eq('stripe_payment_intent', paymentIntent)
    .gt('remaining', 0)
    .select('id')
  if (error) throw new Error(`ai_credits_revoke_failed: ${error.code ?? 'unknown'}`)
  if (data && data.length > 0) console.info('[ai-credits] crédits révoqués', { reason, pi: paymentIntent.slice(-8), lots: data.length })
}

// --- Démonstration -----------------------------------------------------------------------

/** État simulé du compte de démo courant (null hors démo ou sans compte de démo). */
export async function readDemoAi(): Promise<{ account: string; state: DemoAiState } | null> {
  if (!DEMO_BILLING) return null
  const store = await cookies()
  const account = store.get(DEMO_COOKIE)?.value
  if (!isDemoAccountId(account) || account === 'admin') return null
  const [owner, value] = (store.get(DEMO_AI_COOKIE)?.value ?? '').split('~')
  return { account, state: (owner === account ? parseDemoAi(value) : null) ?? emptyDemoAi() }
}

/** Écrit l'état simulé (route handler uniquement : cookies modifiables). */
export async function writeDemoAi(account: string, state: DemoAiState): Promise<void> {
  ;(await cookies()).set(DEMO_AI_COOKIE, `${account}~${serializeDemoAi(state)}`, {
    path: '/',
    maxAge: DEMO_BILLING_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}

/** Formule et compteur du profil de démonstration (base du quota simulé). */
export async function demoQuotaBase(): Promise<{ plan: PlanId; baseUsed: number; quota: number }> {
  const plan = (await getDemoBilling())?.plan ?? 'gratuit'
  return { plan, baseUsed: demoProfileUsage[plan].coachUsed, quota: COACH_ANALYSES[plan] }
}
