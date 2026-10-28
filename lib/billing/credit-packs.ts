// Packs de crédits d'analyses du Coach IA : SOURCE UNIQUE (prix TTC, quantités, validité).
// Module PUR : importable par la route de paiement, le webhook, les écrans et les tests.
//
// Règles (décision client, 28/10/2026) :
//  - disponibles pour toutes les formules, Gratuit compris ;
//  - consommés UNIQUEMENT une fois le quota mensuel de la formule épuisé (reserve_ai_analysis, 0510),
//    le crédit le plus ancien non expiré d'abord ;
//  - valables AI_CREDIT_VALIDITY_MONTHS mois après l'achat ; non remboursables une fois utilisés.
// Le montant facturé est construit côté serveur depuis cette table (Stripe Checkout `price_data`) :
// le client n'envoie qu'un identifiant de pack, jamais un montant ni une quantité.
import { formatPriceIn } from '@/components/profil/pricing'

export type CreditPackId = 'pack10' | 'pack30' | 'pack100'

export type CreditPack = {
  id: CreditPackId
  /** Nombre d'analyses (crédits) du pack. */
  analyses: number
  /** Prix TTC en centimes d'euro. */
  priceCents: number
}

export const AI_CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'pack10', analyses: 10, priceCents: 299 },
  { id: 'pack30', analyses: 30, priceCents: 699 },
  { id: 'pack100', analyses: 100, priceCents: 1999 },
] as const

/** Durée de validité des crédits, en mois calendaires à compter de l'achat. */
export const AI_CREDIT_VALIDITY_MONTHS = 12
export const AI_CREDIT_CURRENCY = 'eur'
/** `metadata.kind` des sessions Checkout d'achat de crédits (distingue des abonnements). */
export const AI_CREDITS_KIND = 'ai_credits'

export function creditPack(id: CreditPackId): CreditPack {
  return AI_CREDIT_PACKS.find((p) => p.id === id) as CreditPack
}

/** Identifiant de pack d'une entrée non fiable (formulaire, metadata) ; null si inconnu. */
export function parseCreditPack(value: unknown): CreditPack | null {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string') return null
  return AI_CREDIT_PACKS.find((p) => p.id === v) ?? null
}

/** Prix TTC en euros (2,99). */
export function packPrice(pack: CreditPack): number {
  return pack.priceCents / 100
}

/** Prix par analyse, en euros, arrondi au centime (0,30 ; 0,23 ; 0,20). */
export function packUnitPrice(pack: CreditPack): number {
  return Math.round(pack.priceCents / pack.analyses) / 100
}

/** Pack au meilleur prix unitaire (mis en avant à l'écran). */
export function bestValuePack(): CreditPack {
  return [...AI_CREDIT_PACKS].sort((a, b) => a.priceCents / a.analyses - b.priceCents / b.analyses)[0]
}

/**
 * Date d'expiration d'un achat : + AI_CREDIT_VALIDITY_MONTHS mois calendaires (miroir TS du calcul SQL
 * `purchased_at + make_interval(months => …)` de grant_ai_credits, 0510). Fin de mois : bornée au dernier
 * jour du mois cible (31 mars + 1 mois → 30 avril), comme PostgreSQL.
 */
export function creditExpiry(purchasedAt: Date, months = AI_CREDIT_VALIDITY_MONTHS): Date {
  const d = new Date(purchasedAt.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

/** Libellés « 10 analyses pour 2,99 € » d'une locale (CGU, FAQ) : `item` = gabarit traduit. */
export function packSummaries(intlLocale: string, item: (count: number, price: string) => string): string[] {
  return AI_CREDIT_PACKS.map((p) => item(p.analyses, formatPriceIn(packPrice(p), intlLocale)))
}
