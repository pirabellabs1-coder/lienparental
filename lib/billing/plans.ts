// Niveaux d'offre et droits (entitlements). Module PUR : aucune dépendance
// serveur, importable depuis un composant client, une route ou un test.
//
// Vocabulaire :
//  - PlanId (app)           : 'gratuit' | 'premium' | 'coparentalite'
//  - users.plan (SQL)       : 'free' | 'premium' | 'coparentalite' | 'admin'
//  - subscriptions.plan     : 'premium_monthly' | 'premium_yearly' | 'coparentalite_monthly' | 'coparentalite_yearly'
//  - plan EFFECTIF          : niveau propre, relevé à 'premium' si un parent lié
//                             (même enfant, rôle titulaire ou parent) est en Coparentalité+.
//                             Voir public.effective_plan() (0380) et docs/FAMILLE.md §12.
import { PLAN_RANK, PRICING, type Cycle, type Offer, type PaidPlan, type PlanId } from '@/components/profil/pricing'
import type { PlanTier, SubscriptionPlan } from '@/lib/supabase/types'

export type { Offer, PaidPlan, PlanId }

// --- Correspondances --------------------------------------------------------

export function subscriptionPlanFor(offer: Offer): SubscriptionPlan {
  const suffix = offer.cycle === 'annuel' ? 'yearly' : 'monthly'
  return `${offer.plan}_${suffix}` as SubscriptionPlan
}

export function offerFromSubscriptionPlan(plan: SubscriptionPlan | string | null | undefined): Offer {
  const p = typeof plan === 'string' ? plan : ''
  return {
    plan: p.startsWith('coparentalite') ? 'coparentalite' : 'premium',
    cycle: p.endsWith('_yearly') ? 'annuel' : 'mensuel',
  }
}

/** users.plan (SQL) → niveau applicatif. 'admin' n'ouvre aucun avantage payant. */
export function planFromDbTier(tier: PlanTier | string | null | undefined): PlanId {
  if (tier === 'coparentalite') return 'coparentalite'
  if (tier === 'premium') return 'premium'
  return 'gratuit'
}

/** Niveau applicatif → users.plan (SQL). */
export function dbTierFor(plan: PlanId): Exclude<PlanTier, 'admin'> {
  return plan === 'gratuit' ? 'free' : plan
}

export function planRank(plan: PlanId): number {
  return PLAN_RANK[plan]
}

export function maxPlan(a: PlanId, b: PlanId): PlanId {
  return planRank(a) >= planRank(b) ? a : b
}

/** 'upgrade' | 'downgrade' | 'same' entre deux niveaux. */
export function planDirection(from: PlanId, to: PlanId): 'upgrade' | 'downgrade' | 'same' {
  const d = planRank(to) - planRank(from)
  return d > 0 ? 'upgrade' : d < 0 ? 'downgrade' : 'same'
}

export function sameOffer(a: Offer | null | undefined, b: Offer | null | undefined): boolean {
  return !!a && !!b && a.plan === b.plan && a.cycle === b.cycle
}

// --- Plan effectif (accès partagé) -------------------------------------------

export type EffectivePlan = {
  /** Niveau à appliquer pour les droits. */
  plan: PlanId
  /** Niveau de l'abonnement propre de l'utilisateur. */
  own: PlanId
  /** 'abonnement' : droits issus de son abonnement ; 'famille' : relevés par un parent lié ; null : gratuit. */
  via: 'abonnement' | 'famille' | null
}

/**
 * Règle de l'accès partagé (miroir TS de public.effective_plan, 0380) :
 * un parent lié en Coparentalité+ apporte les avantages PREMIUM (jamais
 * Coparentalité+ lui-même : pas de partage en cascade, pas d'export avancé
 * ni d'assistance prioritaire par ricochet).
 */
export function resolveEffectivePlan(own: PlanId, linkedParentPlans: readonly PlanId[] = []): EffectivePlan {
  const shared: PlanId = linkedParentPlans.includes('coparentalite') ? 'premium' : 'gratuit'
  if (planRank(own) >= planRank(shared)) {
    return { plan: own, own, via: own === 'gratuit' ? null : 'abonnement' }
  }
  return { plan: shared, own, via: 'famille' }
}

// --- Fonctionnalités ---------------------------------------------------------

export type Feature =
  | 'coach_quota_etendu'
  | 'stockage_etendu'
  | 'modeles_complets'
  | 'export_formats'
  | 'acces_partage'
  | 'suivi_depenses_renforce'
  | 'export_avance'
  | 'assistance_prioritaire'

/** Niveau minimal requis par fonctionnalité. */
export const FEATURE_MIN_PLAN: Record<Feature, PlanId> = {
  coach_quota_etendu: 'premium',
  stockage_etendu: 'premium',
  modeles_complets: 'premium',
  export_formats: 'premium',
  acces_partage: 'coparentalite',
  suivi_depenses_renforce: 'coparentalite',
  export_avance: 'coparentalite',
  assistance_prioritaire: 'coparentalite',
}

/** `hasFeature(plan.plan, 'export_avance')` : à appeler avec le plan EFFECTIF. */
export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return planRank(plan) >= planRank(FEATURE_MIN_PLAN[feature])
}

// --- Quotas -----------------------------------------------------------------

/** Analyses Coach IA par fenêtre glissante de 30 jours (CDC §6.2). */
export const ANALYSIS_QUOTA_BY_PLAN: Record<PlanId, number> = { gratuit: 3, premium: 10, coparentalite: 10 }

/** Stockage (Go) d'un niveau, repris de PRICING.storage. */
export function storageGbFor(plan: PlanId): number {
  return plan === 'gratuit' ? PRICING.storage.free : PRICING.storage[plan]
}

// --- Support ----------------------------------------------------------------

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * Priorité initiale d'un ticket selon le plan effectif (miroir de
 * public.support_ticket_priority_for, 0380). 'urgent' reste réservé aux admins.
 */
export function supportPriorityFor(plan: PlanId): TicketPriority {
  if (hasFeature(plan, 'assistance_prioritaire')) return 'high'
  return plan === 'gratuit' ? 'low' : 'normal'
}

export type { Cycle }
