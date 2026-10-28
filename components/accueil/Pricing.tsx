import { getLocale, getTranslations } from 'next-intl/server'
import { signupPath } from '@/lib/i18n/routing'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { COACH_ANALYSES, PLAN_COMPARISON, PLAN_FEATURE_KEYS, PLAN_FEATURES, PRICING, formatPriceIn, planPromo, storageGb, type ComparisonValue, type PaidPlan, type PlanId } from '@/components/profil/pricing'
import { intlLocale } from '@/lib/i18n/config'
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

type BillingT = (key: string, values?: Record<string, string | number>) => string

/**
 * Boutons des formules payantes : /abonner présélectionne la formule dans « Mon abonnement »
 * (connecté) ou la mémorise pendant la création de compte (non connecté), voir app/abonner/route.ts.
 */
function plans(signedIn: boolean, t: BillingT, loc: string, signup: string): Plan[] {
  const paid = (formule: 'premium' | 'coparentalite') => `/abonner?formule=${formule}&cycle=mensuel`
  // Équivalent traduit de PRICING[plan].freeMonthsLabel.
  const promo = (p: PaidPlan) => {
    const { freeMonths, discountPct } = planPromo(p)
    return freeMonths >= 1 ? t('common.freeMonths', { count: freeMonths }) : t('common.discount', { pct: discountPct })
  }
  const note = (p: PaidPlan) => t('pricing.note.paid', { price: formatPriceIn(PRICING[p].yearly, loc), promo: promo(p) })
  return [
    { key: 'gratuit', price: 0, note: t('pricing.note.gratuit'), cta: { label: t('pricing.cta.createAccount'), href: signup } },
    {
      key: 'premium',
      price: PRICING.premium.monthly,
      period: t('common.period.mensuel'),
      note: note('premium'),
      cta: { label: PREMIUM_TRIAL_DAYS > 0 ? t('pricing.cta.trial', { days: PREMIUM_TRIAL_DAYS }) : signedIn ? t('pricing.cta.subscribePremium') : t('pricing.cta.upgradePremium'), href: paid('premium') },
      featured: true,
    },
    ...(SHOW_COPARENTALITE_PLUS
      ? [{
          key: 'coparentalite' as const,
          price: PRICING.coparentalite.monthly,
          period: t('common.period.mensuel'),
          note: note('coparentalite'),
          cta: { label: signedIn ? t('pricing.cta.subscribeCopa') : t('pricing.cta.chooseCopa'), href: paid('coparentalite') },
        }]
      : []),
  ]
}

function Cell({ value, text, labels }: { value: ComparisonValue; text?: string; labels: { included: string; notIncluded: string } }) {
  if (value === true) return <><Check className="mx-auto h-4 w-4 text-leaf-600" strokeWidth={2.5} aria-hidden /><span className="sr-only">{labels.included}</span></>
  if (value === false) return <><Minus className="mx-auto h-4 w-4 text-night-300" aria-hidden /><span className="sr-only">{labels.notIncluded}</span></>
  return <>{text ?? value}</>
}

/** Bloc tarifs : colonne gauche (≈ 2/3) de la section Tarifs + FAQ (PricingFaq). */
export async function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  const t = await getTranslations('billing')
  const locale = await getLocale()
  const loc = intlLocale(locale)
  const PLANS = plans(signedIn, t, loc, signupPath(locale))
  const cellLabels = { included: t('common.included'), notIncluded: t('common.notIncluded') }
  return (
    <div id="tarifs" className="scroll-mt-24">
      <div className="mx-auto max-w-[640px] text-center">
        <h2 id="pricing-title" className={H2}>{t('pricing.title')}</h2>
        <p className={cn(LEAD, 'mx-auto mt-3 max-w-[52ch]')}>{t('pricing.lead')}</p>
      </div>
      <ul className={cn('mx-auto mt-12 grid max-w-[420px] grid-cols-1 gap-6 md:max-w-none md:items-stretch', PLANS.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
        {PLANS.map(p => (
          <li
            key={p.key}
            className={cn(
              'relative flex flex-col rounded-3xl bg-white p-7 ring-1 sm:p-8',
              p.featured ? 'ring-2 ring-leaf-500 shadow-[0_20px_44px_-28px_rgba(46,125,50,0.6)]' : 'ring-[#E5E7EB]',
            )}
          >
            {p.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-leaf-500 px-3 py-1 text-[12px] font-bold text-white">
                {t('common.mostChosen')}
              </span>
            )}
            <h3 className="text-[20px] font-bold text-night-900">{t(`common.plan.${p.key}`)}</h3>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-1">
              <span className="text-[40px] font-extrabold leading-none tracking-[-0.02em] text-night-900">{p.price === 0 ? t('common.zeroPrice') : formatPriceIn(p.price, loc)}</span>
              {p.period && <span className="text-[15px] font-medium text-night-700">{p.period}</span>}
            </p>
            <p className="mt-3 min-h-[2.6em] text-[14.5px] leading-snug text-night-600">{p.note}</p>
            <ul className="mt-6 flex-1 space-y-3.5 border-t border-[#E5E7EB] pt-6">
              {PLAN_FEATURES[p.key].map((f, i) => (
                <li key={f} className="flex items-start gap-3 text-[15px] leading-snug text-night-800">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" strokeWidth={2.25} aria-hidden />
                  {PLAN_FEATURE_KEYS[p.key][i] ? t(`features.${p.key}.${PLAN_FEATURE_KEYS[p.key][i]}`, { gb: storageGb(p.key), count: COACH_ANALYSES[p.key] }) : f}
                </li>
              ))}
            </ul>
            {/* <a> et non <Link> : /abonner est une route (redirection + cookie), jamais préchargée. */}
            <a href={p.cta.href} className={cn(p.featured ? BTN_PRIMARY : BTN_OUTLINE, 'mt-8 w-full whitespace-nowrap px-4 text-center')}>
              {p.cta.label}
            </a>
          </li>
        ))}
      </ul>

      <details className="group mt-10 text-center">
        <summary className="mx-auto flex min-h-[44px] w-max cursor-pointer list-none items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
          {t('pricing.compare')}
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white text-left ring-1 ring-[#E5E7EB]">
          <table className="w-full min-w-[560px] text-left text-[14.5px]">
            <caption className="sr-only">{t('comparison.caption')}</caption>
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th scope="col" className="px-5 py-4 font-semibold text-night-700">{t('comparison.featureCol')}</th>
                {PLANS.map(p => <th key={p.key} scope="col" className="px-4 py-4 text-center font-bold text-night-900">{t(`common.plan.${p.key}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {PLAN_COMPARISON.map(row => (
                <tr key={row.label}>
                  <th scope="row" className="px-5 py-3.5 font-medium text-night-900">{row.key ? t(`comparison.rows.${row.key}`) : row.label}</th>
                  {PLANS.map(p => <td key={p.key} className="px-4 py-3.5 text-center text-night-700"><Cell value={row.values[p.key]} labels={cellLabels} text={row.key && typeof row.values[p.key] === 'string' ? t(`comparison.cells.${row.key}.${p.key}`, { gb: storageGb(p.key), count: COACH_ANALYSES[p.key] }) : undefined} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
