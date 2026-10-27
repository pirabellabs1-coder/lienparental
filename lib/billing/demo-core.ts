// Abonnement SIMULÉ des comptes de démonstration (aucune clé Stripe, aucun paiement).
// L'état tient dans un cookie (lp_demo_billing) posé par POST /api/stripe/demo, afin
// que le parcours « S'abonner » change réellement le statut affiché partout.
// Module PUR (testé dans tests/billing.test.ts).
import { priceForPlan, type Cycle, type PaidPlan, type PlanId } from '@/components/profil/pricing'
import type { BillingView } from './types'

export const DEMO_BILLING_COOKIE = 'lp_demo_billing'
export const DEMO_BILLING_MAX_AGE = 8 * 60 * 60

export type DemoBilling = {
  plan: PlanId
  cycle: Cycle
  cancelAtPeriodEnd: boolean
  /** Début de l'abonnement simulé (ms epoch, arrondi au jour). */
  startedAt: number
}

const DAY = 86_400_000

export function demoDefault(account: string | null | undefined, now = Date.now()): DemoBilling {
  // Le compte « parent-premium » démarre abonné à Premium mensuel depuis 20 jours.
  if (account === 'parent-premium') return { plan: 'premium', cycle: 'mensuel', cancelAtPeriodEnd: false, startedAt: Math.floor((now - 20 * DAY) / DAY) * DAY }
  return { plan: 'gratuit', cycle: 'mensuel', cancelAtPeriodEnd: false, startedAt: Math.floor(now / DAY) * DAY }
}

export function serializeDemoBilling(s: DemoBilling): string {
  return `${s.plan}.${s.cycle}.${s.cancelAtPeriodEnd ? 1 : 0}.${Math.floor(s.startedAt / DAY)}`
}

export function parseDemoBilling(raw: string | null | undefined): DemoBilling | null {
  if (!raw) return null
  const m = /^(gratuit|premium|coparentalite)\.(mensuel|annuel)\.([01])\.(\d{1,6})$/.exec(raw)
  if (!m) return null
  return { plan: m[1] as PlanId, cycle: m[2] as Cycle, cancelAtPeriodEnd: m[3] === '1', startedAt: Number(m[4]) * DAY }
}

/** Prochaine échéance simulée : début + n périodes, strictement après maintenant. */
export function demoPeriodEnd(s: DemoBilling, now = Date.now()): string {
  const d = new Date(s.startedAt)
  for (let i = 0; i < 400 && d.getTime() <= now; i++) {
    if (s.cycle === 'annuel') d.setUTCFullYear(d.getUTCFullYear() + 1)
    else d.setUTCMonth(d.getUTCMonth() + 1)
  }
  // Midi UTC : la date affichée (fuseau America/Cayenne) reste le même jour calendaire.
  return new Date(d.getTime() + DAY / 2).toISOString()
}

/** Aperçu de facturation (même forme que l'aperçu réel), marqué `live: false`. */
export function demoBillingView(s: DemoBilling, now = Date.now()): BillingView {
  const paid = s.plan !== 'gratuit'
  const formule: PaidPlan = s.plan === 'coparentalite' ? 'coparentalite' : 'premium'
  return {
    live: false,
    plan: s.plan,
    status: paid ? 'active' : null,
    formule,
    cycle: s.cycle,
    amount: priceForPlan(formule, s.cycle),
    periodEnd: paid ? demoPeriodEnd(s, now) : null,
    cancelAtPeriodEnd: paid && s.cancelAtPeriodEnd,
    trialEnd: null,
    payUrl: null,
    card: paid ? { brand: 'visa', last4: '4242' } : null,
    pending: null,
    sharedPremium: false,
  }
}

export type DemoAction =
  | { action: 'subscribe' | 'change'; formule: PaidPlan; cycle: Cycle }
  | { action: 'cancel' | 'resume' | 'reset' }

/** Applique une action simulée. Retourne null si l'action n'a pas de sens dans l'état courant. */
export function applyDemoAction(s: DemoBilling, a: DemoAction, now = Date.now()): DemoBilling | null {
  const paid = s.plan !== 'gratuit'
  switch (a.action) {
    case 'subscribe':
      if (paid) return null
      return { plan: a.formule, cycle: a.cycle, cancelAtPeriodEnd: false, startedAt: Math.floor(now / DAY) * DAY }
    case 'change':
      if (!paid || s.cancelAtPeriodEnd) return null
      return { ...s, plan: a.formule, cycle: a.cycle }
    case 'cancel':
      return paid ? { ...s, cancelAtPeriodEnd: true } : null
    case 'resume':
      return paid ? { ...s, cancelAtPeriodEnd: false } : null
    case 'reset':
      return { plan: 'gratuit', cycle: 'mensuel', cancelAtPeriodEnd: false, startedAt: Math.floor(now / DAY) * DAY }
  }
}
