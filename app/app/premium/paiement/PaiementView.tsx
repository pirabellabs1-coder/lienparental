'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, CrownIcon, Panel, SectionTitle, Stepper, StripeNote, btn } from '@/components/profil/kit'
import { MastercardMark, VisaMark, WalletPayMark } from '@/components/profil/PaymentBrands'
import { SUBSCRIBE_STEPS, formatPrice, periodFor, planLabel, priceForPlan, type Cycle, type PaidPlan } from '@/components/profil/pricing'
import { cn } from '@/lib/cn'
import { BillingNotice } from '../_components/BillingNotice'

const STRIPE_POINTS = [
  'Saisie de la carte sur la page sécurisée de Stripe',
  'Aucune donnée bancaire stockée par Lien Parental',
  'Authentification 3D Secure de votre banque',
  'Codes promo acceptés à l’étape suivante',
]

export function PaiementView({ cycle, plan = 'premium', live, erreur, annule }: { cycle: Cycle; plan?: PaidPlan; live: boolean; erreur: string | null; annule: boolean }) {
  const price = formatPrice(priceForPlan(plan, cycle))
  const [submitting, setSubmitting] = useState(false)

  // Retour arrière depuis Stripe (bfcache) : réactive le bouton.
  useEffect(() => {
    const reset = () => setSubmitting(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  return (
    <>
      <TopBar title="Abonnement" showBack backHref={`/app/premium/formule?formule=${plan}&cycle=${cycle}`} />
      <div className="px-5 pb-8 pt-4">
        <Stepper current={2} total={3} labels={SUBSCRIBE_STEPS} />

        <BillingNotice
          code={erreur}
          info={annule ? 'Paiement annulé : aucun montant n’a été débité. Vous pouvez reprendre quand vous voulez.' : null}
          className="mt-4"
        />

        <SectionTitle className="mt-4">Récapitulatif de votre abonnement</SectionTitle>
        <Panel className="flex items-center gap-4 p-4">
          <CrownIcon className="h-11 w-12 shrink-0" />
          <div>
            <p className="text-[15px] font-bold text-night-900">{planLabel(plan, cycle)}</p>
            <p className="mt-1 text-[15px] font-bold text-night-900">{price} {periodFor(cycle)}</p>
            <p className="mt-1 text-[12px] text-night-700">
              {cycle === 'annuel' ? 'Prélevé une fois par an, résiliable à tout moment' : 'Sans engagement, résiliable à tout moment'}
            </p>
          </div>
        </Panel>

        <SectionTitle className="mt-6" id="pay-info">Paiement</SectionTitle>
        <Panel className="p-4" as="section">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[14px] font-bold text-night-900">
              <LockKeyhole className="h-5 w-5 text-leaf-600" aria-hidden />
              Payer en toute sécurité avec Stripe
            </p>
            <span className="flex items-center gap-1.5" aria-hidden><VisaMark /><MastercardMark /><WalletPayMark /></span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-night-700">
            Vous allez être redirigé vers la page de paiement sécurisée de Stripe, notre prestataire certifié PCI-DSS.
            Vous reviendrez ensuite automatiquement dans l’application.
          </p>
          <ul className="mt-3 space-y-2" aria-label="Garanties du paiement">
            {STRIPE_POINTS.map(p => (
              <li key={p} className="flex items-start gap-2.5 text-[12.5px] text-night-800">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" strokeWidth={2.5} aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </Panel>

        <Banner tone="green" className="mt-4" icon={<ShieldCheck className="h-6 w-6" />} title="Paiement 100 % sécurisé">
          Vos données bancaires ne transitent jamais par Lien Parental.
        </Banner>

        {live ? (
          // Chemin de paiement réel : POST → 303 vers Stripe Checkout.
          <form action="/api/stripe/checkout" method="post" onSubmit={() => setSubmitting(true)} className="mt-6">
            <input type="hidden" name="cycle" value={cycle} />
            <input type="hidden" name="formule" value={plan} />
            <button type="submit" disabled={submitting} aria-busy={submitting} className={cn(btn.primary)}>
              {submitting ? 'Redirection vers Stripe…' : <>Payer {price} avec Stripe <ExternalLink className="h-4 w-4" aria-hidden /></>}
            </button>
          </form>
        ) : (
          // Mode démonstration (aucune clé Stripe) : on simule le retour de Checkout.
          <>
            <Link href={`/app/premium/confirmation?formule=${plan}&cycle=${cycle}`} className={cn(btn.primary, 'mt-6')}>
              Payer {price} avec Stripe
            </Link>
            <p className="mt-2 text-center text-[11.5px] text-night-600">Démonstration : aucun paiement réel n’est effectué.</p>
          </>
        )}
        <StripeNote className="mt-3" />
      </div>
    </>
  )
}
