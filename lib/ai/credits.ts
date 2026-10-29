import 'server-only'
/**
 * Crédits IA ACHETÉS (solde B), côté serveur (logique pure : ./credits-core ; portefeuille : ./wallet).
 *
 * - Supabase : lots public.ai_credits (0510/0520) ; crédités UNIQUEMENT par grant_ai_credits (webhook
 *   Stripe ou relecture de la session chez Stripe au retour de paiement, idempotent par session, jamais
 *   sur la seule redirection) ; consommés et rendus par credits_reserve / credits_release (0520).
 * - Démonstration (sans Supabase) : état simulé dans le cookie lp_demo_ai, lié au compte de démo.
 * Une lecture impossible (migration 0520 non appliquée, base indisponible) affiche un solde nul :
 * jamais une valeur inventée ; la réservation, elle, échoue (fail-closed, aucun appel IA).
 */
import { cookies } from 'next/headers'
import type { CurrentUser } from '@/lib/auth/session'
import { DEMO_COOKIE, isDemoAccountId } from '@/lib/demo-auth'
import { DEMO_BILLING, getDemoBilling } from '@/lib/billing/demo'
import { DEMO_BILLING_MAX_AGE } from '@/lib/billing/demo-core'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { usage as demoProfileUsage } from '@/components/profil/data'
import type { PlanId } from '@/components/profil/pricing'
import { aiServiceDb } from './analyses'
import { getCreditConfig } from './credit-config-server'
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

/**
 * Solde B (crédits ACHETÉS) de l'utilisateur, expiration la plus proche : écrans Profil et Utilisation.
 * Les deux soldes (A mensuel, B acheté) viennent de lib/ai/wallet#getWallet. Lecture impossible
 * (migration absente, base indisponible) : solde nul affiché, jamais une valeur inventée.
 */
export async function getCreditBalance(user: Pick<CurrentUser, 'id' | 'plan'> | null): Promise<CreditBalance> {
  if (SUPABASE_ENABLED && !user) return { balance: 0, nextExpiry: null }
  if (!SUPABASE_ENABLED && !user) {
    const demo = await readDemoAi()
    return demo ? creditBalance(demoAiLots(demo.state)) : { balance: 0, nextExpiry: null }
  }
  try {
    const { getWallet } = await import('./wallet')
    const w = await getWallet(user!)
    return { balance: w.purchased, nextExpiry: w.lots[0]?.expiresAt ?? null }
  } catch (err) {
    console.warn('[ai-credits] solde indisponible', err instanceof Error ? err.message : 'unknown')
    return { balance: 0, nextExpiry: null }
  }
}

// --- Achat --------------------------------------------------------------------------------

const supabaseStore: CreditStore = {
  async grant(g, validityMonths) {
    const { data, error } = await aiServiceDb().rpc('grant_ai_credits', {
      p_user_id: g.userId,
      p_pack: g.pack.id,
      p_quantity: g.pack.credits,
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
  const { config } = await getCreditConfig()
  const res = await grantCreditsFromSession(supabaseStore, session, config.purchasedValidityMonths)
  const ref = session.id.slice(-8)
  if (res.outcome === 'granted') console.info('[ai-credits] achat crédité', { source, session: ref, pack: res.grant?.pack.id })
  // Paiement encaissé mais non crédité (session incohérente, compte inconnu) : à traiter à la main
  // (crédit ou remboursement depuis le Dashboard Stripe). Marqueur stable pour une alerte de logs.
  else if (res.outcome !== 'duplicate' && res.outcome !== 'not_paid' && res.outcome !== 'not_credits') {
    console.error('[ai-credits] PAIEMENT NON CRÉDITÉ', { source, session: ref, reason: res.outcome, paid: session.payment_status === 'paid' })
  }
  return res
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

/** Formule et compteur du profil de démonstration (base des crédits mensuels simulés). */
export async function demoQuotaBase(): Promise<{ plan: PlanId; baseUsed: number; quota: number }> {
  const plan = (await getDemoBilling())?.plan ?? 'gratuit'
  const { config } = await getCreditConfig()
  return { plan, baseUsed: demoProfileUsage[plan].coachUsed, quota: config.monthlyCredits[plan] }
}
