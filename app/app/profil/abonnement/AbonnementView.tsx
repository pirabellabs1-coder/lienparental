'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, BadgeCheck, CalendarCheck, CalendarDays, Check, CreditCard, Euro, Receipt, RefreshCw, RotateCcw, ShieldCheck, Tag, XCircle } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { Banner, BrandHeader, CrownIcon, DetailRow, ListGroup, ListRow, Pill, SectionTitle, StripeNote, btn } from '@/components/profil/kit'
import { PlanPicker } from '@/components/profil/PlanPicker'
import { PlanRadioCard } from '@/components/profil/PlanRadioCard'
import { PLAN_FEATURES, PLAN_NAME, PREMIUM_INCLUDED, PRICING, formatPrice, periodFor, planLabel, priceForPlan, type Cycle, type PaidPlan } from '@/components/profil/pricing'
import { profile, subscription as mockSubscription } from '@/components/profil/data'
import { openBillingPortal, postBilling } from '@/lib/billing/client'
import { STATUS_LABEL, formatDateFr, type BillingView } from '@/lib/billing/types'
import { cn } from '@/lib/cn'
import { BillingNotice } from '@/app/app/premium/_components/BillingNotice'
import { CardValue } from '@/app/app/premium/_components/CardValue'

const FORMULE_INFO: Record<string, string> = {
  scheduled: 'Changement de formule enregistré : il s’appliquera à votre prochaine échéance.',
  pending_change_canceled: 'Le changement de formule programmé a été annulé.',
  unchanged: 'Votre formule reste inchangée.',
  upgraded: 'Votre nouvelle formule est active. La différence au prorata a été facturée aujourd’hui.',
  downgraded: 'Votre nouvelle formule est active. Le temps non utilisé est crédité au prorata sur vos prochaines factures.',
}

export function AbonnementView({ view, managed, erreur, formule }: { view: BillingView; managed: boolean; erreur: string | null; formule: string | null }) {
  return managed
    ? <ActiveSubscription view={view} erreur={erreur} info={formule ? FORMULE_INFO[formule] ?? null : null} />
    : <ChoosePlan view={view} erreur={erreur} />
}

function ChoosePlan({ view, erreur }: { view: BillingView; erreur: string | null }) {
  const [plan, setPlan] = useState<PaidPlan>('premium')
  const [cycle, setCycle] = useState<Cycle>('mensuel')
  const p = PRICING[plan]
  const ended = view.live && (view.status === 'canceled' || view.status === 'incomplete_expired')
  const included = plan === 'premium' ? PREMIUM_INCLUDED : PLAN_FEATURES.coparentalite
  return (
    <>
      <BrandHeader title="Abonnement" notifications={profile.notifications} />
      <div className="px-5 pb-8 pt-3">
        <BillingNotice code={erreur} className="mb-4" />
        {ended && (
          <Banner tone="night" className="mb-4" title="Votre abonnement a pris fin">
            Votre compte est à l’offre gratuite. Vos données restent conservées et consultables.
          </Banner>
        )}
        {view.sharedPremium && (
          <Banner tone="green" className="mb-4" icon={<ShieldCheck className="h-6 w-6" />} title="Premium offert par votre famille">
            Un parent lié à vos enfants est abonné à Coparentalité+ : vous profitez des avantages Premium sans abonnement.
            Vous pouvez tout de même souscrire votre propre formule.
          </Banner>
        )}
        <div className="flex items-start gap-4 rounded-xl2 border border-orange-100 bg-orange-50/60 p-4">
          <CrownIcon className="mt-1 h-10 w-12 shrink-0" />
          <div>
            <h1 className="text-[17px] font-bold text-night-900">Passez à {PLAN_NAME[plan]}</h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-night-800">
              {plan === 'premium'
                ? 'Débloquez toutes les fonctionnalités et profitez d’un espace de stockage plus important.'
                : 'Tout Premium, et les parents liés à vos enfants en profitent aussi.'}
            </p>
          </div>
        </div>

        <PlanPicker value={plan} onChange={setPlan} className="mt-5" />

        <fieldset className="mt-6">
          <legend className="mb-3 text-[15px] font-bold text-night-900">Choisissez votre facturation</legend>
          <div className="space-y-3">
            <PlanRadioCard plan={plan} cycle="mensuel" checked={cycle === 'mensuel'} onChange={setCycle} />
            <PlanRadioCard plan={plan} cycle="annuel" checked={cycle === 'annuel'} onChange={setCycle} />
          </div>
        </fieldset>

        <div className="mt-3 flex items-center gap-3.5 rounded-xl2 border border-night-100 bg-night-50/50 p-3.5">
          <Tag className="h-6 w-6 shrink-0 text-orange-500" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-night-900">
            Avec l’annuel, économisez <strong className="font-bold text-orange-700">{formatPrice(p.yearlySavings)}</strong>
            <br />
            par an, soit <strong className="font-bold text-orange-700">{p.freeMonthsLabel}</strong> !
          </p>
        </div>

        <SectionTitle className="mt-6">Inclus dans {PLAN_NAME[plan]}</SectionTitle>
        <ul className="space-y-2.5">
          {included.map(f => (
            <li key={f} className="flex items-center gap-3 text-[13px] text-night-900">
              <Check className="h-4 w-4 shrink-0 text-leaf-500" strokeWidth={2.75} aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <Link href={`/app/premium?formule=${plan}`} className="mt-4 inline-flex min-h-[44px] items-center text-[13px] font-semibold text-leaf-600 underline underline-offset-2">
          Comparer les trois formules
        </Link>

        <Link href={`/app/premium/paiement?formule=${plan}&cycle=${cycle}`} className={cn(btn.primary, 'mt-4')}>Continuer</Link>
        <StripeNote className="mt-3" />
      </div>
    </>
  )
}

function ActiveSubscription({ view, erreur, info }: { view: BillingView; erreur: string | null; info: string | null }) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [loading, setLoading] = useState<null | 'cancel' | 'resume' | 'portal'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(info)

  const cycle = view.cycle
  const formule = view.formule
  const name = PLAN_NAME[formule]
  const endLabel = view.live ? formatDateFr(view.periodEnd) : mockSubscription.endsOn
  const nextLabel = view.live ? formatDateFr(view.periodEnd) : mockSubscription.nextPayment
  const amount = view.amount ?? priceForPlan(formule, cycle)
  const status = view.status ?? 'active'
  const inTrouble = status === 'past_due' || status === 'unpaid'
  const statusLabel = view.cancelAtPeriodEnd ? `Résilié · actif jusqu’au ${endLabel}` : STATUS_LABEL[status]
  const demoPlan = `?plan=${view.plan === 'gratuit' ? 'premium' : view.plan}`
  const historyHref = view.live ? '/app/profil/abonnement/historique' : `/app/profil/abonnement/historique${demoPlan}`
  const changeHref = view.live ? '/app/profil/abonnement/changer' : `/app/profil/abonnement/changer${demoPlan}`

  const demo = (msg: string) => { setError(null); setNotice(`Démonstration : ${msg}`) }

  async function setCancel(cancel: boolean) {
    setError(null)
    if (!view.live) {
      setCancelOpen(false)
      return demo(cancel ? 'la résiliation serait enregistrée chez Stripe.' : 'la résiliation serait annulée.')
    }
    setLoading(cancel ? 'cancel' : 'resume')
    const res = await postBilling<{ cancel_at_period_end: boolean; current_period_end: string }>('/api/stripe/cancel', { cancel })
    setLoading(null)
    setCancelOpen(false)
    if (!res.ok) return setError(res.message)
    setNotice(cancel
      ? `Résiliation enregistrée. Vos avantages ${name} restent actifs jusqu’au ${formatDateFr(res.data.current_period_end)}.`
      : 'Votre abonnement continue : la résiliation est annulée.')
    router.refresh()
  }

  async function portal() {
    setError(null)
    if (!view.live) return demo('le portail sécurisé Stripe s’ouvrirait pour modifier la carte.')
    setLoading('portal')
    const res = await openBillingPortal()
    if (!res.ok) {
      setLoading(null)
      setError(res.message)
    }
  }

  return (
    <>
      <BrandHeader title="Mon abonnement" notifications={profile.notifications} />
      <div className="px-5 pb-8 pt-3">
        <BillingNotice code={erreur} className="mb-4" />
        {error && (
          <div role="alert" className="mb-4">
            <Banner tone="red" icon={<AlertTriangle className="h-5 w-5" />} title="Opération impossible">{error}</Banner>
          </div>
        )}
        {notice && <div role="status" className="mb-4"><Banner tone="night">{notice}</Banner></div>}

        <Link
          href={historyHref}
          className="flex items-start gap-4 rounded-xl2 border border-gold-100 bg-gradient-to-br from-orange-50/80 to-gold-50 p-4 transition hover:border-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
        >
          <CrownIcon className="mt-1 h-10 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[15px] font-bold text-night-900">Lien Parental {name}</h1>
              <Pill tone={inTrouble ? 'orange' : 'gold'}>{view.cancelAtPeriodEnd ? 'Résilié' : STATUS_LABEL[status]}</Pill>
            </div>
            <p className="mt-1.5 text-[12px] text-night-800">
              {view.cancelAtPeriodEnd ? `Vos avantages restent actifs jusqu’au ${endLabel}.` : inTrouble ? 'Un paiement est en attente.' : 'Votre abonnement est actif.'}
            </p>
            <p className="mt-1 text-[12px] text-night-800">
              {formule === 'coparentalite'
                ? 'Profitez de toutes les fonctionnalités Coparentalité+. Les parents liés à vos enfants bénéficient des avantages Premium.'
                : 'Profitez de toutes les fonctionnalités Premium.'}
            </p>
          </div>
        </Link>

        {inTrouble && (
          <Banner tone="red" className="mt-4" icon={<AlertTriangle className="h-6 w-6" />} title="Le dernier paiement a échoué">
            {status === 'unpaid'
              ? `Votre compte est repassé à l’offre gratuite. Mettez à jour votre moyen de paiement pour retrouver ${name}.`
              : `Stripe va retenter le prélèvement. Mettez à jour votre moyen de paiement pour éviter l’interruption de ${name}.`}
          </Banner>
        )}

        <SectionTitle className="mt-6">Détails de votre abonnement</SectionTitle>
        <dl className="divide-y divide-night-100 overflow-hidden rounded-xl2 border border-night-100 bg-white shadow-soft">
          <DetailRow strong icon={<CalendarCheck className="h-5 w-5" />} label="Statut" value={<span className={cn('font-bold', inTrouble || view.cancelAtPeriodEnd ? 'text-orange-700' : 'text-leaf-600')}>{statusLabel}</span>} />
          <DetailRow strong icon={<BadgeCheck className="h-5 w-5" />} label="Formule" value={planLabel(formule, cycle)} />
          {view.pending && (
            <DetailRow strong icon={<RefreshCw className="h-5 w-5" />} label="Changement prévu" value={`${planLabel(view.pending.plan, view.pending.cycle)} le ${nextLabel}`} />
          )}
          <DetailRow strong icon={<CalendarDays className="h-5 w-5" />} label={view.cancelAtPeriodEnd ? 'Fin des avantages' : 'Prochain paiement'} value={view.cancelAtPeriodEnd ? endLabel : nextLabel} />
          <DetailRow strong icon={<Euro className="h-5 w-5" />} label="Montant" value={`${formatPrice(amount)} ${periodFor(cycle)}`} />
          <DetailRow strong icon={<CreditCard className="h-5 w-5" />} label="Moyen de paiement" value={<CardValue card={view.card} />} />
        </dl>

        {!inTrouble && !view.cancelAtPeriodEnd && (
          <Banner tone="green" className="mt-4" icon={<ShieldCheck className="h-6 w-6" />} title="Votre abonnement est à jour">
            Merci pour votre confiance.
          </Banner>
        )}

        <SectionTitle className="mt-6">Gérez votre abonnement</SectionTitle>
        <ListGroup>
          {!view.cancelAtPeriodEnd && !inTrouble && (
            <ListRow href={changeHref} icon={<RefreshCw className="h-5 w-5" />} title="Changer de formule" subtitle="Premium ou Coparentalité+, mensuel ou annuel" />
          )}
          {!view.cancelAtPeriodEnd && !inTrouble && formule === 'premium' && (
            <ListRow
              href={`${changeHref}${view.live ? '?' : '&'}formule=coparentalite`}
              icon={<CrownIcon className="h-6 w-7" />}
              title="Passer à Coparentalité+"
              subtitle="Les parents liés profitent aussi de Premium, effet immédiat"
            />
          )}
          <ListRow
            onClick={loading ? undefined : portal}
            icon={<CreditCard className="h-5 w-5" />}
            title={loading === 'portal' ? 'Ouverture du portail sécurisé…' : 'Gérer mon moyen de paiement'}
            subtitle="Carte bancaire et coordonnées de facturation, via Stripe"
          />
          <ListRow href={historyHref} icon={<Receipt className="h-5 w-5" />} title="Factures" subtitle="Historique et téléchargement PDF" />
          {view.cancelAtPeriodEnd ? (
            <ListRow
              onClick={loading ? undefined : () => setCancel(false)}
              icon={<RotateCcw className="h-5 w-5" />}
              title={loading === 'resume' ? 'Réactivation…' : 'Réactiver l’abonnement'}
              subtitle="Annuler la résiliation programmée"
            />
          ) : (
            <ListRow onClick={() => setCancelOpen(true)} tone="danger" icon={<XCircle className="h-5 w-5" />} title="Résilier l’abonnement" subtitle={<span className="text-night-600">Sans frais, effectif en fin de période</span>} />
          )}
        </ListGroup>
        <StripeNote className="mt-5" />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => setCancel(true)}
        title="Résilier l’abonnement ?"
        description={`Aucun nouveau prélèvement ne sera effectué. Vos avantages ${name} resteront actifs jusqu’au ${endLabel}, puis votre compte passera à l’offre gratuite (vos données restent consultables).${formule === 'coparentalite' ? ' Les parents liés perdront alors l’accès partagé.' : ''} Vous pourrez vous réabonner à tout moment.`}
        confirmLabel="Résilier"
        cancelLabel={`Garder ${name}`}
        loading={loading === 'cancel'}
      />
    </>
  )
}
