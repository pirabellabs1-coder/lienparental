import Link from 'next/link'
import { CalendarDays, Clock, CreditCard, Euro, ShieldCheck } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, CrownIcon, DetailRow, Stepper, SuccessBurst, btn } from '@/components/profil/kit'
import { PLAN_NAME, SUBSCRIBE_STEPS, formatPrice, parseCycle, parsePaidPlan, periodFor, planLabel, priceForPlan } from '@/components/profil/pricing'
import { profile, subscription as mockSubscription } from '@/components/profil/data'
import { getCurrentUser } from '@/lib/auth/session'
import { BILLING_LIVE } from '@/lib/billing/config'
import { getBillingOverview, mockBillingView } from '@/lib/billing/overview'
import { getStripe, idOf } from '@/lib/billing/stripe'
import { isUuid, syncSubscription } from '@/lib/billing/subscription'
import { formatDateFr, type BillingView } from '@/lib/billing/types'
import { cn } from '@/lib/cn'
import { CardValue } from '../_components/CardValue'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

/**
 * Étape 3 — retour de Stripe Checkout (success_url).
 * Le webhook reste la source de synchronisation ; on relit néanmoins la session
 * Checkout (appartenance vérifiée) pour activer immédiatement l'abonnement si le
 * webhook n'est pas encore arrivé. Opération idempotente, données issues de Stripe.
 */
async function loadLive(sessionId: string | null): Promise<{ view: BillingView; prenom: string } | null> {
  const user = await getCurrentUser()
  if (!user || !isUuid(user.id)) return null

  if (sessionId && SESSION_RE.test(sessionId)) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId)
      const subId = idOf(session.subscription)
      if (session.client_reference_id === user.id && session.status === 'complete' && subId) {
        await syncSubscription(subId, user.id)
      }
    } catch (err) {
      console.error('[billing] confirmation : session illisible', err instanceof Error ? err.message : 'unknown')
    }
  }
  return { view: await getBillingOverview(user.id), prenom: user.prenom }
}

export default async function ConfirmationPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : null

  const live = BILLING_LIVE ? await loadLive(sessionId) : null
  // Facturation réelle sans session lisible : jamais d'affichage « confirmé » par défaut.
  // Démonstration : formule et cycle simulés depuis l'URL (?formule=coparentalite&cycle=annuel).
  const view = live?.view ?? mockBillingView(BILLING_LIVE ? 'gratuit' : parsePaidPlan(sp.formule), parseCycle(sp.cycle))
  const cycle = view.cycle
  const formule = view.formule
  const label = planLabel(formule, cycle)
  const prenom = live ? live.prenom : profile.prenom
  const active = view.plan !== 'gratuit'
  const nextPayment = live ? formatDateFr(view.periodEnd) : mockSubscription.nextPayment
  const amount = view.amount ?? priceForPlan(formule, cycle)

  return (
    <>
      <TopBar title="Abonnement" />
      <div className="px-5 pb-8 pt-4">
        <Stepper current={3} total={3} labels={SUBSCRIBE_STEPS} />

        {active ? (
          <>
            <SuccessBurst className="mt-2" />
            <div role="status" className="text-center">
              <h1 className="text-[22px] font-extrabold text-night-900">Abonnement confirmé !</h1>
              <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-night-800">
                Merci{prenom ? ` ${prenom}` : ''}, votre abonnement {label} est maintenant actif.
              </p>
            </div>
          </>
        ) : (
          <div role="status" className="mt-6 text-center">
            <Clock className="mx-auto h-12 w-12 text-gold-500" aria-hidden />
            <h1 className="mt-3 text-[22px] font-extrabold text-night-900">Paiement en cours de validation</h1>
            <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-night-800">
              Votre banque confirme le paiement. Cela prend généralement quelques secondes : actualisez cette page dans un instant.
              Un e-mail vous sera envoyé dès l’activation.
            </p>
          </div>
        )}

        <dl className="mt-6 divide-y divide-night-100 overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-soft">
          <div className="flex items-center gap-3 px-4 py-3">
            <CrownIcon className="h-6 w-7 shrink-0" />
            <div>
              <dt className="text-[13px] font-bold text-night-900">Abonnement</dt>
              <dd className="text-[12px] text-night-700">{label}</dd>
            </div>
          </div>
          {active && <DetailRow strong icon={<CalendarDays className="h-5 w-5" />} label="Prochain paiement" value={nextPayment} />}
          <DetailRow strong icon={<Euro className="h-5 w-5" />} label="Montant" value={`${formatPrice(amount)} ${periodFor(cycle)}`} />
          {active && <DetailRow strong icon={<CreditCard className="h-5 w-5" />} label="Moyen de paiement" value={<CardValue card={view.card} />} />}
        </dl>

        {active && (
          <Banner tone="green" className="mt-4" icon={<ShieldCheck className="h-6 w-6" />} title="Votre abonnement est actif">
            {formule === 'coparentalite'
              ? 'Profitez de toutes les fonctionnalités Coparentalité+. Les parents liés à vos enfants bénéficient désormais des avantages Premium.'
              : `Profitez de toutes les fonctionnalités ${PLAN_NAME[formule]}.`}
          </Banner>
        )}

        {active ? (
          <Link href="/app" className={cn(btn.primary, 'mt-6')}>Accéder à mon espace</Link>
        ) : (
          <Link href={sessionId ? `/app/premium/confirmation?session_id=${encodeURIComponent(sessionId)}` : '/app/profil/abonnement'} className={cn(btn.primary, 'mt-6')}>
            Actualiser
          </Link>
        )}
      </div>
    </>
  )
}
