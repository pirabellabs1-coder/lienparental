// Packs de crédits IA (recharges, solde B) : valeurs PAR DÉFAUT et fonctions de présentation.
// Module PUR : importable par la route de paiement, le webhook, les écrans et les tests.
//
// Règles (cahier V6, validé) :
//  - disponibles pour toutes les formules, Gratuit compris ; une recharge n'ouvre AUCUN droit
//    Premium ou Coparentalité+ et ne change pas la capacité du coffre-fort ;
//  - consommés après les crédits mensuels de la formule (solde A), le lot qui expire le plus tôt
//    d'abord (credits_reserve, 0520) ;
//  - valables 24 mois après l'achat ; conservés lors d'un changement de formule ou d'une résiliation ;
//    non remboursables une fois utilisés (sauf droit légal).
// Les packs ACTIFS (prix, quantité, activation) sont modifiables depuis l'administration
// (public.credit_config, 0520) : les écrans reçoivent la liste active en paramètre ; à défaut,
// la liste ci-dessous (= version 1). Le montant facturé est construit côté serveur depuis la
// configuration (Stripe Checkout `price_data`) : le client n'envoie qu'un identifiant de pack.
import { formatPriceIn } from '@/components/profil/pricing'
import { DEFAULT_CREDIT_CONFIG, activePacks, type PackConfig } from '@/lib/ai/credit-config'

export type CreditPackId = string

export type CreditPack = {
  id: CreditPackId
  /** Nombre de crédits du pack. */
  credits: number
  /** Prix TTC en centimes d'euro. */
  priceCents: number
}

const toPack = (p: PackConfig): CreditPack => ({ id: p.id, credits: p.credits, priceCents: p.priceCents })

/** Packs par défaut (10 = 2,49 € ; 30 = 5,99 € ; 75 = 11,99 € ; 150 = 19,99 €). */
export const AI_CREDIT_PACKS: readonly CreditPack[] = activePacks(DEFAULT_CREDIT_CONFIG).map(toPack)

/** Packs actifs d'une configuration (ordre croissant). */
export function packsFromConfig(cfg: { packs: PackConfig[] }): CreditPack[] {
  return cfg.packs.filter((p) => p.active).sort((a, b) => a.credits - b.credits).map(toPack)
}

/** Durée de validité par défaut des crédits achetés, en mois calendaires à compter de l'achat. */
export const AI_CREDIT_VALIDITY_MONTHS = DEFAULT_CREDIT_CONFIG.purchasedValidityMonths
export const AI_CREDIT_CURRENCY = 'eur'
/** `metadata.kind` des sessions Checkout d'achat de crédits (distingue des abonnements). */
export const AI_CREDITS_KIND = 'ai_credits'

/** Identifiant de pack d'une entrée non fiable (formulaire, metadata) ; null si inconnu ou inactif. */
export function parseCreditPack(value: unknown, packs: readonly CreditPack[] = AI_CREDIT_PACKS): CreditPack | null {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string') return null
  return packs.find((p) => p.id === v) ?? null
}

/** Prix TTC en euros (2,49). */
export function packPrice(pack: CreditPack): number {
  return pack.priceCents / 100
}

/** Prix par crédit, en euros, à 3 décimales (0,249 ; 0,200 ; 0,160 ; 0,133). */
export function packUnitPrice(pack: CreditPack): number {
  return Math.round((pack.priceCents / pack.credits) * 10) / 1000
}

/** Pack au meilleur prix unitaire (mis en avant à l'écran). */
export function bestValuePack(packs: readonly CreditPack[] = AI_CREDIT_PACKS): CreditPack {
  return [...packs].sort((a, b) => a.priceCents / a.credits - b.priceCents / b.credits)[0]
}

/** Plus petit pack couvrant `missing` crédits (proposé quand le solde est insuffisant). */
export function packCovering(missing: number, packs: readonly CreditPack[] = AI_CREDIT_PACKS): CreditPack | null {
  const sorted = [...packs].sort((a, b) => a.credits - b.credits)
  return sorted.find((p) => p.credits >= missing) ?? sorted[sorted.length - 1] ?? null
}

/**
 * Date d'expiration d'un achat : + N mois calendaires (miroir TS de `_credits_add_months`, 0520).
 * Fin de mois : bornée au dernier jour du mois cible (31 mars + 1 mois → 30 avril), comme PostgreSQL.
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

/** Libellés « 10 crédits pour 2,49 € » d'une locale (CGU, FAQ, llms.txt) : `item` = gabarit traduit. */
export function packSummaries(intlLocale: string, item: (count: number, price: string) => string, packs: readonly CreditPack[] = AI_CREDIT_PACKS): string[] {
  return packs.map((p) => item(p.credits, formatPriceIn(packPrice(p), intlLocale)))
}
