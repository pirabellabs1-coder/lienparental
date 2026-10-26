// Types partagés serveur ↔ composants client des écrans abonnement.
// Aucune dépendance serveur : importable depuis un composant 'use client'.
import type { Cycle, Offer, PaidPlan, PlanId } from '@/components/profil/pricing'
import type { SubscriptionStatus } from '@/lib/supabase/types'

export type BillingCard = { brand: string; last4: string }

export type BillingView = {
  /** true = données réelles Stripe/Supabase ; false = démonstration. */
  live: boolean
  /** Niveau ouvert par l'abonnement PROPRE de l'utilisateur (hors accès partagé). */
  plan: PlanId
  status: SubscriptionStatus | null
  /** Formule facturée (Premium par défaut sans abonnement). */
  formule: PaidPlan
  cycle: Cycle
  /** Montant de la prochaine échéance en euros (null si inconnu). */
  amount: number | null
  /** Date ISO de fin de période courante (= prochain prélèvement si non résilié). */
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  card: BillingCard | null
  /** Changement de formule programmé au prochain cycle. */
  pending: Offer | null
  /** Avantages Premium reçus d'un parent lié en Coparentalité+ (accès partagé). */
  sharedPremium: boolean
}

export type InvoiceItem = {
  id: string
  number: string | null
  /** Date ISO de création de la facture. */
  date: string
  amount_cents: number
  currency: string
  status: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft'
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

export type InvoicesResponse = {
  data: InvoiceItem[]
  page: { next_cursor: string | null; has_more: boolean }
}

/** Enveloppe d'erreur commune des routes /api/stripe/*. */
export type ApiError = { error: { code: string; message: string; correlation_id: string } }

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Actif',
  trialing: 'Période d’essai',
  past_due: 'Paiement en retard',
  unpaid: 'Impayé',
  canceled: 'Résilié',
  incomplete: 'Paiement à finaliser',
  incomplete_expired: 'Expiré',
  paused: 'En pause',
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'America/Cayenne' }).format(d)
}

export function formatCardBrand(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express',
    cartes_bancaires: 'CB', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', diners: 'Diners',
  }
  return map[brand.toLowerCase()] ?? brand
}
