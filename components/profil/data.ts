// Données de démonstration des écrans Profil / Abonnement / Stockage.
// Comptes réels : profil (useAccountProfile), formule et consommation (components/profil/usage-server),
// abonnement (lib/billing). Ces valeurs ne servent qu'en démonstration ou comme repli neutre.
import { mockUser } from '@/lib/mock-data'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { MONTHLY_CREDITS, PRICING, type Cycle, type PlanId } from './pricing'

export const APP_VERSION = '1.0.0'
export const SUPPORT_EMAIL = 'support@lienparental.fr'

export type Plan = PlanId

export const profile = {
  prenom: mockUser.prenom,
  nom: mockUser.nom,
  email: mockUser.email,
  avatarUrl: mockUser.avatarUrl,
  memberSince: 'mai 2024',
  /** Pastille de la cloche : fictive en démonstration uniquement (jamais pour un compte réel). */
  notifications: SUPABASE_ENABLED ? 0 : mockUser.notifications,
}

/** Plan affiché par défaut. Aperçus : `?plan=premium` / `?plan=coparentalite` / `?plan=gratuit`. */
export const DEFAULT_PLAN: Plan = 'gratuit'

export function resolvePlan(value: string | string[] | undefined): Plan {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'premium' || v === 'coparentalite' || v === 'gratuit' ? v : DEFAULT_PLAN
}

export const subscription = {
  cycle: 'mensuel' as Cycle,
  status: 'actif' as const,
  endsOn: '12 août 2025',
  nextPayment: '12 août 2025',
  card: { brand: 'VISA', last4: '4242' },
}

/** Démonstration uniquement (comptes réels : loadProfileUsage, components/profil/usage-server). */
export const usage = {
  gratuit: { storageUsed: 1.2, storageMax: PRICING.storage.free, coachUsed: 1, coachMax: MONTHLY_CREDITS.gratuit },
  premium: { storageUsed: 5, storageMax: PRICING.storage.premium, coachUsed: 7, coachMax: MONTHLY_CREDITS.premium },
  coparentalite: { storageUsed: 5, storageMax: PRICING.storage.coparentalite, coachUsed: 7, coachMax: MONTHLY_CREDITS.coparentalite },
}

export const invoices = [
  { id: 'in_5', date: '12 juil. 2025', amount: 14.99, status: 'paye' as const },
  { id: 'in_4', date: '12 juin 2025', amount: 14.99, status: 'paye' as const },
  { id: 'in_3', date: '12 mai 2025', amount: 14.99, status: 'paye' as const },
  { id: 'in_2', date: '12 avr. 2025', amount: 14.99, status: 'paye' as const },
  { id: 'in_1', date: '12 mars 2025', amount: 14.99, status: 'paye' as const },
]

/** Clé sessionStorage : récapitulatif affiché après l'assistant "Informations personnelles". */
export const SUMMARY_KEY = 'lp-profile-summary'
