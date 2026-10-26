'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { Check, Gift, ShieldCheck, Wallet } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, StripeNote, btn } from '@/components/profil/kit'
import { CycleToggle } from '@/components/profil/CycleToggle'
import { PlanPicker } from '@/components/profil/PlanPicker'
import { PLAN_NAME, PRICING, formatPrice, parseCycle, parsePaidPlan, type Cycle, type PaidPlan } from '@/components/profil/pricing'
import { cn } from '@/lib/cn'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Choix détaillé de la formule (étape 1 du tunnel d'abonnement).
export default function FormulePage({ searchParams }: PageProps) {
  const sp = use(searchParams)
  const [cycle, setCycle] = useState<Cycle>(parseCycle(sp.cycle))
  const [plan, setPlan] = useState<PaidPlan>(parsePaidPlan(sp.formule))
  const p = PRICING[plan]
  const name = PLAN_NAME[plan]

  return (
    <>
      <TopBar title="Abonnement" showBack backHref={`/app/premium?formule=${plan}`} showBell={false} />
      <div className="px-5 pb-8 pt-3">
        <PlanPicker value={plan} onChange={setPlan} />
        <CycleToggle value={cycle} onChange={setCycle} plan={plan} className="mt-3" />

        <fieldset className="mt-5 space-y-4">
          <legend className="sr-only">Facturation {name}</legend>

          <PlanOption
            value="mensuel"
            checked={cycle === 'mensuel'}
            onChange={setCycle}
            icon={<Wallet className="h-6 w-6" aria-hidden />}
            title="Mensuel"
            price={formatPrice(p.monthly)}
            period="/ mois"
            bullets={[
              `Accès à toutes les fonctionnalités ${name}`,
              'Paiement mensuel, sans engagement',
              'Annulation possible à tout moment',
            ]}
          />

          <PlanOption
            value="annuel"
            checked={cycle === 'annuel'}
            onChange={setCycle}
            icon={<Gift className="h-6 w-6" aria-hidden />}
            title="Annuel"
            badge={p.freeMonthsLabel}
            ribbon="Meilleur choix"
            price={formatPrice(p.yearly)}
            period="/ an"
            sub={`Soit ${formatPrice(p.yearlyPerMonth)} / mois au lieu de ${formatPrice(p.monthly)} / mois`}
            bullets={[
              `Accès à toutes les fonctionnalités ${name}`,
              `${p.freeMonthsLabel} chaque année`,
              'Paiement annuel, plus économique',
              'Annulation possible à tout moment',
            ]}
          />
        </fieldset>

        <Banner tone="green" className="mt-5" icon={<ShieldCheck className="h-6 w-6" />} title="Votre abonnement est 100 % sécurisé">
          Données protégées et confidentielles
        </Banner>

        <Link href={`/app/premium/paiement?formule=${plan}&cycle=${cycle}`} className={cn(btn.primary, 'mt-5')}>
          Continuer
        </Link>
        <StripeNote className="mt-3" />
      </div>
    </>
  )
}

function PlanOption({
  value, checked, onChange, icon, title, price, period, sub, bullets, badge, ribbon,
}: {
  value: Cycle
  checked: boolean
  onChange: (c: Cycle) => void
  icon: React.ReactNode
  title: string
  price: string
  period: string
  sub?: string
  bullets: string[]
  badge?: string
  ribbon?: string
}) {
  return (
    <label
      className={cn(
        'relative block cursor-pointer overflow-hidden rounded-xl2 border bg-white p-4 shadow-soft transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-leaf-400',
        checked ? 'border-leaf-500' : 'border-night-100 hover:border-night-200',
      )}
    >
      <input type="radio" name="cycle" value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      {ribbon && (
        <span aria-hidden className="absolute -right-9 top-5 w-36 rotate-45 bg-leaf-700 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-white">
          {ribbon}
        </span>
      )}
      <span className="flex items-center gap-4">
        <span aria-hidden className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-night-50 text-night-900">{icon}</span>
        <span>
          <span className="block text-[15px] font-bold text-night-900">{title}</span>
          {badge && <span className="mt-1 inline-block rounded-md bg-gold-200 px-2 py-0.5 text-[11.5px] font-bold text-night-900">{badge}</span>}
          <span className="mt-1 block text-[26px] font-extrabold leading-none text-night-900">
            {price} <span className="text-[13px] font-medium text-night-700">{period}</span>
          </span>
        </span>
      </span>
      {sub && <span className="mt-2 block text-[12px] text-night-700">{sub}</span>}
      <span className="mt-4 block space-y-2">
        {bullets.map(b => (
          <span key={b} className="flex items-center gap-2.5 text-[12.5px] text-night-800">
            <Check className="h-4 w-4 shrink-0 text-leaf-500" strokeWidth={2.5} aria-hidden />
            {b}
          </span>
        ))}
      </span>
      <span aria-hidden className="mt-4 flex justify-center">
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full border-2', checked ? 'border-leaf-500' : 'border-night-200')}>
          {checked && <span className="h-3 w-3 rounded-full bg-leaf-500" />}
        </span>
      </span>
    </label>
  )
}
