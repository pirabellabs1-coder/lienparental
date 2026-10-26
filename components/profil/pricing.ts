// Tarifs des formules payantes : source unique pour tous les écrans. Le montant
// réellement facturé est celui des Price IDs Stripe : garder les deux alignés.
//   Premium        : STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY
//   Coparentalité+ : STRIPE_PRICE_COPARENTALITE_MONTHLY / STRIPE_PRICE_COPARENTALITE_YEARLY
// Les prix ci-dessous sont modifiables : tous les libellés promotionnels en sont dérivés.

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
  const discountPct = Math.max(0, Math.floor((savings / reference) * 100))
  const freeMonths = Math.floor(savings / monthly)
  return {
    monthly,
    yearly,
    /** Équivalent mensuel affiché pour la formule annuelle. */
    yearlyPerMonth: round2(yearly / 12),
    /** Prix de référence barré : 12 mois au tarif mensuel. */
    yearlyReference: reference,
    /** Économie annuelle réelle par rapport au mensuel. */
    yearlySavings: savings,
    freeMonthsLabel: freeMonths >= 1 ? `${freeMonths} mois offerts` : `-${discountPct} %`,
    discountLabel: `-${discountPct} %`,
    discountShortLabel: `Économisez ${discountPct} %`,
  } as const
}

/** Premium : 11,99 €/mois, 99 €/an. */
const PREMIUM = derivePlanPricing(11.99, 99)
/**
 * Coparentalité+ : 19,99 €/mois. Annuel 189 € (≈ 15,75 €/mois, 2 mois offerts) :
 * proposition modifiable, à valider par le client puis à reporter dans le Price Stripe.
 */
const COPARENTALITE = derivePlanPricing(19.99, 189)

export const PRICING = {
  currency: 'EUR',
  // Champs historiques (Premium) conservés à plat : PRICING.monthly, PRICING.freeMonthsLabel…
  ...PREMIUM,
  premium: PREMIUM,
  coparentalite: COPARENTALITE,
  storage: { free: 2, premium: 10, coparentalite: 10 }, // Go
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
  'Coach IA étendu : 10 analyses par mois',
  'Tous les modèles de courriers et dossiers',
  'Coffre-fort sécurisé et stockage étendu',
  'Journal chronologique avancé',
  'Calendrier partagé illimité',
  'Export PDF, Word et Canva',
  'Synchronisation multi-appareils',
  'Support prioritaire',
] as const

/** Ce que Coparentalité+ ajoute à Premium. */
export const COPARENTALITE_EXTRAS = [
  'Plusieurs parents : la famille liée profite des avantages Premium',
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
    '3 analyses du Coach IA par mois',
    'Journal et calendrier',
    'Export PDF',
  ],
  premium: [
    `Coffre-fort de ${PRICING.storage.premium} Go`,
    '10 analyses du Coach IA par mois',
    'Tous les modèles de courriers et dossiers',
    'Journal chronologique avancé',
    'Export PDF, Word et Canva',
    'Synchronisation multi-appareils',
  ],
  // « Accès web et PWA » : demandé dans la liste Coparentalité+, mais disponible pour toutes
  // les formules (ne pas le présenter comme exclusif ; voir PLAN_COMPARISON).
  coparentalite: ['Tout Premium', ...COPARENTALITE_EXTRAS, 'Accès web et application installable (PWA)'],
}

/** Valeur d'une cellule du comparatif : true = inclus, false = non inclus, texte = précision. */
export type ComparisonValue = boolean | string

/** Comparatif des trois formules (écran /app/premium, changement de formule, page d'accueil). */
export const PLAN_COMPARISON: ReadonlyArray<{ label: string; values: Record<PlanId, ComparisonValue> }> = [
  { label: 'Coach IA', values: { gratuit: '3 analyses / mois', premium: '10 analyses / mois', coparentalite: '10 analyses / mois' } },
  { label: 'Coffre-fort sécurisé', values: { gratuit: `${PRICING.storage.free} Go`, premium: `${PRICING.storage.premium} Go`, coparentalite: `${PRICING.storage.coparentalite} Go` } },
  { label: 'Journal et calendrier', values: { gratuit: true, premium: true, coparentalite: true } },
  { label: 'Modèles de courriers et dossiers', values: { gratuit: 'Essentiels', premium: 'Tous', coparentalite: 'Tous' } },
  { label: 'Export PDF, Word et Canva', values: { gratuit: 'PDF', premium: true, coparentalite: true } },
  { label: 'Plusieurs parents (accès partagé)', values: { gratuit: false, premium: false, coparentalite: true } },
  { label: 'Suivi renforcé des dépenses', values: { gratuit: false, premium: false, coparentalite: true } },
  { label: 'Export avancé (avocat, médiateur)', values: { gratuit: false, premium: false, coparentalite: true } },
  { label: 'Assistance', values: { gratuit: 'Standard', premium: 'Prioritaire', coparentalite: 'Prioritaire, traitée en premier' } },
  { label: 'Accès web et application installable', values: { gratuit: true, premium: true, coparentalite: true } },
]

export const PREMIUM_INCLUDED = [
  `Stockage ${PRICING.storage.premium} Go`,
  'Catégories illimitées',
  'Exporter dans tous les formats',
  'Scanner illimité',
  'Coffre-fort sécurisé',
  'Support prioritaire',
] as const

/** Libellés du stepper du tunnel d'abonnement. */
export const SUBSCRIBE_STEPS = ['Choix de l’offre', 'Paiement', 'Confirmation']
