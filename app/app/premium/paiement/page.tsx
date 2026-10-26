import { BILLING_LIVE } from '@/lib/billing/config'
import { parseCycle, parsePaidPlan } from '@/components/profil/pricing'
import { firstParam } from '../_components/BillingNotice'
import { PaiementView } from './PaiementView'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/*
 * Étape 2 — Paiement.
 * SÉCURITÉ : aucune donnée de carte n'est saisie dans l'application. Le bouton
 * envoie un POST /api/stripe/checkout qui redirige (303) vers la page hébergée
 * Stripe Checkout ; la carte y est saisie, chiffrée et conservée par Stripe (PCI-DSS).
 */
export default async function PaiementPage({ searchParams }: PageProps) {
  const sp = await searchParams
  return (
    <PaiementView
      cycle={parseCycle(sp.cycle)}
      plan={parsePaidPlan(sp.formule)}
      live={BILLING_LIVE}
      erreur={firstParam(sp.erreur)}
      annule={sp.annule === '1'}
    />
  )
}
