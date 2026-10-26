import Link from 'next/link'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { PLAN_COMPARISON, PLAN_FEATURES, PLAN_NAME, PRICING, formatPrice, type ComparisonValue, type PlanId } from '@/components/profil/pricing'
import { cn } from '@/lib/cn'
import { BTN_OUTLINE, BTN_PRIMARY, H2, LEAD } from './ui'

/** 3e formule (décision client du 26/10/2026 : créée). Repasser à false pour la masquer. */
export const SHOW_COPARENTALITE_PLUS = true

/**
 * Jours d'essai gratuit de Premium. Doit refléter la configuration Stripe réelle
 * (subscription_data.trial_period_days dans app/api/stripe/checkout/route.ts) : aucun essai aujourd'hui.
 * Si un essai est ajouté côté Stripe, renseigner ici le même nombre de jours.
 */
export const PREMIUM_TRIAL_DAYS = 0

type Plan = {
  key: PlanId
  price: number
  period?: string
  note: string
  cta: { label: string; href: string }
  featured?: boolean
}

/** Boutons des formules payantes : vers l'abonnement si une session existe, sinon vers la création de compte. */
function plans(signedIn: boolean): Plan[] {
  const paid = (formule: 'premium' | 'coparentalite') => (signedIn ? `/app/premium?formule=${formule}` : '/onboarding')
  return [
    { key: 'gratuit', price: 0, note: 'Pour bien commencer', cta: { label: 'Créer un compte', href: '/onboarding' } },
    {
      key: 'premium',
      price: PRICING.premium.monthly,
      period: '/ mois',
      note: `ou ${formatPrice(PRICING.premium.yearly)} par an, ${PRICING.premium.freeMonthsLabel}`,
      cta: { label: PREMIUM_TRIAL_DAYS > 0 ? `Essayer ${PREMIUM_TRIAL_DAYS} jours gratuitement` : 'Passer à Premium', href: paid('premium') },
      featured: true,
    },
    ...(SHOW_COPARENTALITE_PLUS
      ? [{
          key: 'coparentalite' as const,
          price: PRICING.coparentalite.monthly,
          period: '/ mois',
          note: `ou ${formatPrice(PRICING.coparentalite.yearly)} par an, ${PRICING.coparentalite.freeMonthsLabel}`,
          cta: { label: 'Choisir cette formule', href: paid('coparentalite') },
        }]
      : []),
  ]
}

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) return <><Check className="mx-auto h-4 w-4 text-leaf-600" strokeWidth={2.5} aria-hidden /><span className="sr-only">Inclus</span></>
  if (value === false) return <><Minus className="mx-auto h-4 w-4 text-night-300" aria-hidden /><span className="sr-only">Non inclus</span></>
  return <>{value}</>
}

/** Bloc tarifs : colonne gauche (≈ 2/3) de la section Tarifs + FAQ (PricingFaq). */
export function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  const PLANS = plans(signedIn)
  return (
    <div id="tarifs" className="scroll-mt-24">
      <h2 id="pricing-title" className={H2}>Nos formules simples et transparentes</h2>
      <p className={cn(LEAD, 'mt-3 max-w-[56ch]')}>Gratuit pour commencer. Sans engagement, résiliable à tout moment depuis votre profil.</p>
      <ul className={cn('mt-10 grid grid-cols-1 gap-5 md:items-stretch', PLANS.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {PLANS.map(p => (
          <li
            key={p.key}
            className={cn(
              'relative flex flex-col rounded-3xl bg-white p-6 ring-1',
              p.featured ? 'ring-2 ring-leaf-500 shadow-[0_20px_44px_-28px_rgba(46,125,50,0.6)]' : 'ring-[#E5E7EB]',
            )}
          >
            {p.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-leaf-500 px-3 py-1 text-[12px] font-bold text-white">
                Le plus populaire
              </span>
            )}
            <h3 className="text-[18px] font-bold text-night-900">{PLAN_NAME[p.key]}</h3>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-1">
              <span className="text-[32px] font-extrabold leading-none tracking-[-0.02em] text-night-900">{p.price === 0 ? '0 €' : formatPrice(p.price)}</span>
              {p.period && <span className="text-[14px] text-night-700">{p.period}</span>}
            </p>
            <p className="mt-2 min-h-[2.8em] text-[14px] leading-snug text-night-600">{p.note}</p>
            <ul className="mt-5 flex-1 space-y-3 border-t border-[#E5E7EB] pt-5">
              {PLAN_FEATURES[p.key].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-night-800">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" strokeWidth={2.25} aria-hidden />{f}
                </li>
              ))}
            </ul>
            <Link href={p.cta.href} className={cn(p.featured ? BTN_PRIMARY : BTN_OUTLINE, 'mt-7 w-full whitespace-normal px-4 text-center')}>
              {p.cta.label}
            </Link>
          </li>
        ))}
      </ul>

      <details className="group mt-8">
        <summary className="flex min-h-[44px] w-max cursor-pointer list-none items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
          Comparer les formules en détail
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-[#E5E7EB]">
          <table className="w-full min-w-[560px] text-left text-[14.5px]">
            <caption className="sr-only">Comparatif des formules</caption>
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th scope="col" className="px-5 py-4 font-semibold text-night-700">Fonctionnalité</th>
                {PLANS.map(p => <th key={p.key} scope="col" className="px-4 py-4 text-center font-bold text-night-900">{PLAN_NAME[p.key]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {PLAN_COMPARISON.map(row => (
                <tr key={row.label}>
                  <th scope="row" className="px-5 py-3.5 font-medium text-night-900">{row.label}</th>
                  {PLANS.map(p => <td key={p.key} className="px-4 py-3.5 text-center text-night-700"><Cell value={row.values[p.key]} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
