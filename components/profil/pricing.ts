// Tarifs des formules payantes : source unique pour tous les écrans. Le montant
// réellement facturé est celui des Price IDs Stripe : garder les deux alignés.
//   Premium        : STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY
//   Coparentalité+ : STRIPE_PRICE_COPARENTALITE_MONTHLY / STRIPE_PRICE_COPARENTALITE_YEARLY
// Les prix ci-dessous sont modifiables : tous les libellés promotionnels en sont dérivés.
// Un Price Stripe est IMMUABLE : changer un prix d'abonnement = créer un nouveau Price (scripts/
// stripe-setup.ts), reporter son identifiant dans les variables d'environnement, puis déployer
// (docs/STRIPE.md). Les crédits IA, eux, sont configurables sans déploiement (admin, 0520).
// Communication (cahier V6) : jamais « illimité » pour le Coach IA (quota de crédits), jamais
// « 2 mois offerts » : l'économie annuelle est d'ENVIRON 17 % par rapport à douze mensualités.
import { DEFAULT_CREDIT_CONFIG } from '@/lib/ai/credit-config'

export type Cycle = 'mensuel' | 'annuel'
/** Formules payantes, de la moins à la plus complète. */
export type PaidPlan = 'premium' | 'coparentalite'
/** Niveau d'offre applicatif (les identifiants SQL sont 'free' | 'premium' | 'coparentalite'). */
export type PlanId = 'gratuit' | PaidPlan
/** Une formule souscrite = un niveau + un cycle de facturation. */
export type Offer = { plan: PaidPlan; cycle: Cycle }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Prix et libellés dérivés d'une formule. Exporté pour les tests. */
export function derivePlanPricing(monthly: number, yearly: number) {
  const reference = round2(monthly * 12)
  const savings = round2(reference - yearly)
  // Arrondi (et non troncature) : 17,2 % et 16,97 % s'affichent tous deux « environ 17 % ».
  const discountPct = Math.max(0, Math.round((savings / reference) * 100))
  return {
    monthly,
    yearly,
    /** Équivalent mensuel affiché pour la formule annuelle. */
    yearlyPerMonth: round2(yearly / 12),
    /** Prix de référence barré : 12 mois au tarif mensuel. */
    yearlyReference: reference,
    /** Économie annuelle réelle par rapport au mensuel. */
    yearlySavings: savings,
    /** Historique : plus de « mois offerts » (V6) ; même libellé que discountLabel. */
    freeMonthsLabel: `environ -${discountPct} %`,
    discountLabel: `environ -${discountPct} %`,
    discountShortLabel: `Économisez environ ${discountPct} %`,
  } as const
}

/** Premium : 14,99 €/mois, 149 €/an (≈ 12,42 €/mois, économie d'environ 17 %). */
const PREMIUM = derivePlanPricing(14.99, 149)
/** Coparentalité+ : 24,99 €/mois, 249 €/an (≈ 20,75 €/mois, économie d'environ 17 %). */
const COPARENTALITE = derivePlanPricing(24.99, 249)

/**
 * Crédits IA mensuels inclus par formule (solde A, cahier V6) : 5 / 60 / 200. Valeurs PAR DÉFAUT
 * affichées sur les pages publiques ; la valeur appliquée est celle de la configuration active
 * (public.credit_config, modifiable dans l'administration). Remis à zéro à chaque période de
 * facturation, sans report. Selon la formule PROPRE du compte : un parent invité ne profite jamais
 * des crédits du titulaire (non mutualisés). Au-delà : crédits achetés (lib/billing/credit-packs.ts).
 */
export const MONTHLY_CREDITS: Readonly<Record<PlanId, number>> = DEFAULT_CREDIT_CONFIG.monthlyCredits
/** @deprecated Nom historique (« analyses ») : utiliser MONTHLY_CREDITS. */
export const COACH_ANALYSES = MONTHLY_CREDITS

export const PRICING = {
  currency: 'EUR',
  // Champs historiques (Premium) conservés à plat : PRICING.monthly, PRICING.freeMonthsLabel…
  ...PREMIUM,
  premium: PREMIUM,
  coparentalite: COPARENTALITE,
  storage: { free: 2, premium: 10, coparentalite: 25 }, // Go
} as const

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** 11.99 → "11,99 €" (espace insécable conservée par Intl). */
export function formatPrice(value: number): string {
  return eur.format(value)
}

export const PLAN_NAME: Record<PlanId, string> = {
  gratuit: 'Gratuit',
  premium: 'Premium',
  coparentalite: 'Coparentalité+',
}

/** Ordre des niveaux : sert aux comparaisons montée / descente. */
export const PLAN_RANK: Record<PlanId, number> = { gratuit: 0, premium: 1, coparentalite: 2 }

export const PLAN_LABELS: Record<PaidPlan, Record<Cycle, string>> = {
  premium: { mensuel: 'Premium mensuel', annuel: 'Premium annuel' },
  coparentalite: { mensuel: 'Coparentalité+ mensuel', annuel: 'Coparentalité+ annuel' },
}

/** Libellés Premium (historique : utilisé par les écrans et e-mails existants). */
export const PLAN_LABEL: Record<Cycle, string> = PLAN_LABELS.premium

export function planLabel(plan: PaidPlan, cycle: Cycle): string {
  return PLAN_LABELS[plan][cycle]
}

export function priceForPlan(plan: PaidPlan, cycle: Cycle): number {
  const p = PRICING[plan]
  return cycle === 'annuel' ? p.yearly : p.monthly
}

/** Prix Premium d'un cycle (historique). */
export function priceFor(cycle: Cycle): number {
  return priceForPlan('premium', cycle)
}

export function periodFor(cycle: Cycle): string {
  return cycle === 'annuel' ? '/ an' : '/ mois'
}

export function parseCycle(value: unknown): Cycle {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'annuel' ? 'annuel' : 'mensuel'
}

/** Formule payante d'un paramètre d'URL ; Premium par défaut (affichage uniquement). */
export function parsePaidPlan(value: unknown): PaidPlan {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'coparentalite' ? 'coparentalite' : 'premium'
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === 'premium' || value === 'coparentalite'
}

export const PREMIUM_FEATURES = [
  `Coach IA étendu : ${MONTHLY_CREDITS.premium} crédits IA par mois`,
  'Tous les modèles de courriers et dossiers',
  'Coffre-fort sécurisé et stockage étendu',
  'Journal chronologique avancé',
  'Calendrier partagé illimité',
  'Export PDF, Word et Canva',
  'Synchronisation multi-appareils',
  'Assistance traitée avant l’offre Gratuite',
] as const

/** Ce que Coparentalité+ ajoute à Premium. */
export const COPARENTALITE_EXTRAS = [
  'Espace familial partagé sur invitation (2 adultes, jusqu’à 5 enfants)',
  'Suivi renforcé des dépenses partagées',
  'Export avancé (dossier pour avocat, médiateur)',
  'Assistance prioritaire',
] as const

/**
 * Avantages par formule, réutilisables (comparatifs, page d'accueil, e-mails).
 * Chaque liste est autonome : Coparentalité+ reprend « Tout Premium » puis ses ajouts.
 */
export const PLAN_FEATURES: Record<PlanId, readonly string[]> = {
  gratuit: [
    `Coffre-fort de ${PRICING.storage.free} Go`,
    `${MONTHLY_CREDITS.gratuit} crédits IA par mois`,
    'Journal et calendrier',
    'Export PDF',
  ],
  premium: [
    `Coffre-fort de ${PRICING.storage.premium} Go`,
    `${MONTHLY_CREDITS.premium} crédits IA par mois`,
    'Tous les modèles de courriers et dossiers',
    'Journal chronologique avancé',
    'Export PDF, Word et Canva',
    'Synchronisation multi-appareils',
  ],
  // « Accès web et PWA » : demandé dans la liste Coparentalité+, mais disponible pour toutes
  // les formules (ne pas le présenter comme exclusif ; voir PLAN_COMPARISON).
  coparentalite: ['Tout Premium', `${MONTHLY_CREDITS.coparentalite} crédits IA par mois`, `Coffre-fort de ${PRICING.storage.coparentalite} Go`, ...COPARENTALITE_EXTRAS, 'Accès web et application installable (PWA)'],
}

/**
 * Niveau d'assistance par formule : SOURCE UNIQUE des libellés, alignée sur la priorité
 * réellement posée sur les tickets (lib/billing/plans.ts#supportPriorityFor et
 * public.support_ticket_priority_for, 0380) : Gratuit basse, Premium normale,
 * Coparentalité+ haute. Seule Coparentalité+ est « prioritaire ».
 */
export const SUPPORT_LABEL: Record<PlanId, string> = {
  gratuit: 'Standard',
  premium: 'Avant l’offre Gratuite',
  coparentalite: 'Prioritaire, traitée en premier',
}

/** Valeur d'une cellule du comparatif : true = inclus, false = non inclus, texte = précision. */
export type ComparisonValue = boolean | string

/** Comparatif des trois formules (Mon abonnement /app/abonnement, page d'accueil). */
export const PLAN_COMPARISON: ReadonlyArray<{ /** Clé stable de traduction (i18n, additif). */ key?: string; label: string; values: Record<PlanId, ComparisonValue> }> = [
  { key: 'coach', label: 'Coach IA', values: { gratuit: `${MONTHLY_CREDITS.gratuit} crédits / mois`, premium: `${MONTHLY_CREDITS.premium} crédits / mois`, coparentalite: `${MONTHLY_CREDITS.coparentalite} crédits / mois` } },
  { key: 'vault', label: 'Coffre-fort sécurisé', values: { gratuit: `${PRICING.storage.free} Go`, premium: `${PRICING.storage.premium} Go`, coparentalite: `${PRICING.storage.coparentalite} Go` } },
  { key: 'journalCalendar', label: 'Journal et calendrier', values: { gratuit: true, premium: true, coparentalite: true } },
  { key: 'templates', label: 'Modèles de courriers et dossiers', values: { gratuit: 'Essentiels', premium: 'Tous', coparentalite: 'Tous' } },
  { key: 'export', label: 'Export PDF, Word et Canva', values: { gratuit: 'PDF', premium: true, coparentalite: true } },
  { key: 'multiParents', label: 'Espace familial partagé (2 adultes, sur invitation)', values: { gratuit: false, premium: false, coparentalite: true } },
  { key: 'expenses', label: 'Suivi renforcé des dépenses', values: { gratuit: false, premium: false, coparentalite: true } },
  { key: 'exportAdvanced', label: 'Export avancé (avocat, médiateur)', values: { gratuit: false, premium: false, coparentalite: true } },
  { key: 'support', label: 'Assistance', values: SUPPORT_LABEL },
  { key: 'webApp', label: 'Accès web et application installable', values: { gratuit: true, premium: true, coparentalite: true } },
]

export const PREMIUM_INCLUDED = [
  `Stockage ${PRICING.storage.premium} Go`,
  'Catégories illimitées',
  'Exporter dans tous les formats',
  'Scanner illimité',
  'Coffre-fort sécurisé',
  'Assistance traitée avant l’offre Gratuite',
] as const

/** Libellés du stepper du tunnel d'abonnement. */
export const SUBSCRIBE_STEPS = ['Choix de l’offre', 'Paiement', 'Confirmation']

// --- i18n (ajouts uniquement) ------------------------------------------------
// Les libellés français ci-dessus restent la référence (facturation, e-mails, admin).
// Les écrans traduisent au rendu via ces clés stables (catalogue messages/*/billing.json).

/** Clés de traduction des avantages, alignées index par index sur PLAN_FEATURES. */
export const PLAN_FEATURE_KEYS: Record<PlanId, readonly string[]> = {
  gratuit: ['vault', 'coach', 'journalCalendar', 'exportPdf'],
  premium: ['vault', 'coach', 'templatesAll', 'journalAdvanced', 'exportAll', 'sync'],
  coparentalite: ['allPremium', 'coach', 'vault', 'multiParents', 'expenses', 'exportAdvanced', 'supportPriority', 'webPwa'],
}

/**
 * Valeurs numériques des libellés promotionnels (mêmes calculs que derivePlanPricing).
 * `freeMonths` vaut toujours 0 : le cahier V6 interdit « 2 mois offerts » (l'économie réelle est
 * d'environ 17 %) ; les écrans affichent donc le pourcentage arrondi.
 */
export function planPromo(plan: PaidPlan): { freeMonths: number; discountPct: number } {
  const p = PRICING[plan]
  return {
    freeMonths: 0,
    discountPct: Math.max(0, Math.round((p.yearlySavings / p.yearlyReference) * 100)),
  }
}

/** Stockage (Go) d'une formule : PRICING.storage indexé par niveau applicatif. */
export function storageGb(plan: PlanId): number {
  return plan === 'gratuit' ? PRICING.storage.free : PRICING.storage[plan]
}

const eurByLocale = new Map<string, Intl.NumberFormat>()

/** Prix en euros formaté pour une locale Intl (fr-FR, en-US, pt-BR). Montant inchangé. */
export function formatPriceIn(value: number, intlLocale: string): string {
  let f = eurByLocale.get(intlLocale)
  if (!f) {
    f = new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
    eurByLocale.set(intlLocale, f)
  }
  return f.format(value)
}
