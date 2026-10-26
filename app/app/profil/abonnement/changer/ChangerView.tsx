'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Info } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, SectionTitle, btn } from '@/components/profil/kit'
import { PlanComparison } from '@/components/profil/PlanComparison'
import { PlanPicker } from '@/components/profil/PlanPicker'
import { PlanRadioCard } from '@/components/profil/PlanRadioCard'
import { PLAN_NAME, formatPrice, periodFor, planLabel, priceForPlan, type Cycle, type Offer, type PaidPlan } from '@/components/profil/pricing'
import { planDirection, sameOffer } from '@/lib/billing/plans'
import { postBilling } from '@/lib/billing/client'
import { BillingNotice } from '@/app/app/premium/_components/BillingNotice'

type Props = {
  live: boolean
  /** Formule actuellement facturée. */
  current: Offer
  /** Formule programmée au prochain cycle (null si aucune). */
  pending: Offer | null
  /** Formule présélectionnée (`?formule=coparentalite`), sinon celle du prochain cycle. */
  initialPlan?: PaidPlan | null
  /** Date (formatée) de fin de la période en cours. */
  effectiveLabel: string
  erreur: string | null
}

type Impact = 'none' | 'cancel_pending' | 'scheduled' | 'upgrade' | 'downgrade'

function impactOf(current: Offer, pending: Offer | null, target: Offer): Impact {
  if (sameOffer(target, pending ?? current)) return 'none'
  if (sameOffer(target, current)) return 'cancel_pending'
  const d = planDirection(current.plan, target.plan)
  return d === 'same' ? 'scheduled' : d
}

export function ChangerView({ live, current, pending, initialPlan, effectiveLabel, erreur }: Props) {
  const router = useRouter()
  const next = pending ?? current
  const [plan, setPlan] = useState<PaidPlan>(initialPlan ?? next.plan)
  const [cycle, setCycle] = useState<Cycle>(next.cycle)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target: Offer = { plan, cycle }
  const impact = impactOf(current, pending, target)
  const targetLabel = planLabel(plan, cycle)
  const targetPrice = `${formatPrice(priceForPlan(plan, cycle))} ${periodFor(cycle)}`
  const backHref = live ? '/app/profil/abonnement' : `/app/profil/abonnement?plan=${current.plan}`

  const IMPACT_TEXT: Record<Impact, string> = {
    none: 'C’est déjà la formule de votre prochain cycle.',
    cancel_pending: `Le changement programmé sera annulé : vous restez en ${planLabel(current.plan, current.cycle)}.`,
    scheduled: `Le passage en ${targetLabel} (${targetPrice}) s’appliquera le ${effectiveLabel}, sans frais ni prorata.`,
    upgrade: `Effet immédiat. La différence au prorata pour la période en cours est prélevée aujourd’hui, puis ${targetPrice}. Les parents liés à vos enfants profitent aussitôt des avantages Premium.`,
    downgrade: `Effet immédiat. Le temps non utilisé est crédité au prorata sur vos prochaines factures, puis ${targetPrice}. Les parents liés à vos enfants perdent l’accès partagé.`,
  }

  const submitLabel = loading
    ? 'Changement en cours…'
    : impact === 'cancel_pending' ? 'Annuler le changement programmé'
    : impact === 'upgrade' || impact === 'downgrade' ? `Passer à ${PLAN_NAME[plan]} maintenant`
    : 'Confirmer le changement'

  async function apply() {
    if (impact === 'none' || loading) return
    setError(null)
    setLoading(true)
    if (!live) {
      // Démonstration : sélection simulée, aucun appel Stripe.
      router.push(`/app/premium/confirmation?formule=${plan}&cycle=${cycle}`)
      return
    }
    // Le serveur résout les Price IDs ; aucun montant n'est calculé côté client.
    const res = await postBilling<{ status: string }>('/api/stripe/change-plan', { formule: plan, cycle })
    setConfirmOpen(false)
    if (!res.ok) {
      setLoading(false)
      setError(res.message)
      return
    }
    router.push(`/app/profil/abonnement?formule=${encodeURIComponent(res.data.status)}`)
    router.refresh()
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (impact === 'none' || loading) return
    // Changement immédiat (prélèvement ou crédit) : confirmation explicite.
    if (impact === 'upgrade' || impact === 'downgrade') setConfirmOpen(true)
    else void apply()
  }

  return (
    <>
      <TopBar title="Changer de formule" showBack backHref={backHref} showBell={false} />
      <form onSubmit={onSubmit} className="px-5 pb-8 pt-3">
        <BillingNotice code={erreur} className="mb-4" />
        {error && <div role="alert" className="mb-4"><Banner tone="red" title="Changement impossible">{error}</Banner></div>}

        <Banner tone="night" icon={<Info className="h-5 w-5" />} title="Changez de formule à tout moment.">
          Mensuel ou annuel : au prochain cycle, sans prorata. Premium ou Coparentalité+ : immédiatement, au prorata.
          {pending && <> Un passage en <strong>{planLabel(pending.plan, pending.cycle)}</strong> est déjà programmé.</>}
        </Banner>

        <p className="mt-4 text-[12.5px] text-night-800">
          Formule actuelle : <strong className="text-night-900">{planLabel(current.plan, current.cycle)}</strong>
        </p>

        <PlanPicker value={plan} onChange={setPlan} className="mt-3" label="Nouvelle formule" />

        <fieldset className="mt-5">
          <legend className="mb-3 text-[14px] font-bold text-night-900">Facturation {PLAN_NAME[plan]}</legend>
          <div className="space-y-3">
            {(['mensuel', 'annuel'] as const).map(c => (
              <PlanRadioCard
                key={c}
                plan={plan}
                cycle={c}
                checked={cycle === c}
                onChange={setCycle}
                current={sameOffer({ plan, cycle: c }, current)}
              />
            ))}
          </div>
        </fieldset>

        <p role="status" aria-live="polite" className="mt-4 rounded-xl2 border border-night-100 bg-night-50/60 p-3.5 text-[12.5px] leading-relaxed text-night-900">
          {IMPACT_TEXT[impact]}
        </p>

        <SectionTitle className="mt-6">Comparatif des formules</SectionTitle>
        <PlanComparison plans={['premium', 'coparentalite']} highlight={plan} />

        <button type="submit" disabled={impact === 'none' || loading} aria-busy={loading} className={`${btn.primary} mt-6`}>
          {submitLabel}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { if (!loading) setConfirmOpen(false) }}
        onConfirm={() => void apply()}
        title={`Passer à ${targetLabel} ?`}
        description={IMPACT_TEXT[impact]}
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        loading={loading}
      />
    </>
  )
}
