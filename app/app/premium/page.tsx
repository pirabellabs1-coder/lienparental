'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { CalendarDays, Check, Cloud, Gift, ShieldCheck, Briefcase, Star, Wallet, Calendar } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { CrownIcon, StripeNote } from '@/components/profil/kit'
import { CycleToggle } from '@/components/profil/CycleToggle'
import { PlanComparison } from '@/components/profil/PlanComparison'
import { PlanPicker } from '@/components/profil/PlanPicker'
import { PLAN_FEATURES, PLAN_NAME, PRICING, formatPrice, parsePaidPlan, type Cycle, type PaidPlan } from '@/components/profil/pricing'
import { cn } from '@/lib/cn'
import { BillingNotice, firstParam } from './_components/BillingNotice'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// M14 — "Passez à Lien Parental Premium / Coparentalité+". Le paiement réel passe par
// Stripe Checkout (POST /api/stripe/checkout) depuis l'écran /app/premium/paiement.
// `?formule=coparentalite` présélectionne Coparentalité+.
export default function PremiumPage({ searchParams }: PageProps) {
  const sp = use(searchParams)
  const [plan, setPlan] = useState<PaidPlan>(parsePaidPlan(sp.formule))
  const [cycle, setCycle] = useState<Cycle>('annuel')
  const erreur = firstParam(sp.erreur)
  const p = PRICING[plan]
  const q = (c: Cycle) => `/app/premium/formule?formule=${plan}&cycle=${c}`

  return (
    <>
      <TopBar title="Abonnement" showBack backHref="/app/profil" showBell={false} />

      <div className="px-5 pb-8 pt-2">
        <BillingNotice code={erreur} className="mb-4" />
        <h1 className="text-center text-[24px] font-extrabold leading-tight text-night-900">
          Passez à
          <br />
          Lien Parental <span className="text-leaf-500">{PLAN_NAME[plan]}</span>
        </h1>

        <HeroIllustration />

        <p className="mx-auto max-w-[300px] text-center text-[13px] leading-relaxed text-night-800">
          Tous les outils pour informer, accompagner et préserver le lien parent-enfant.
        </p>

        <PlanPicker value={plan} onChange={setPlan} className="mt-5" label="Formule souhaitée" />

        <ul className="mt-5 space-y-2.5" aria-label={`Avantages ${PLAN_NAME[plan]}`}>
          {PLAN_FEATURES[plan].map(f => (
            <li key={f} className="flex items-center gap-3 text-[13px] text-night-900">
              <span aria-hidden className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-leaf-500 text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <h2 className="mt-7 text-center text-[13.5px] font-semibold text-night-900">Choisissez votre facturation</h2>
        <CycleToggle value={cycle} onChange={setCycle} plan={plan} className="mt-3" />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <PlanTile
            selected={cycle === 'mensuel'}
            href={q('mensuel')}
            className="bg-leaf-500"
            title="Mensuel"
            price={<>{formatPrice(p.monthly)} <span className="text-[11px] font-medium">/ mois</span></>}
            note={<>Paiement mensuel,<br />sans engagement</>}
            icon={<Wallet className="h-5 w-5" aria-hidden />}
          />
          <PlanTile
            selected={cycle === 'annuel'}
            href={q('annuel')}
            className="bg-leaf-800"
            title="Annuel"
            ribbon
            badge={p.freeMonthsLabel}
            price={<>{formatPrice(p.yearly)} <span className="text-[11px] font-medium">/ an</span></>}
            note={<>Soit {formatPrice(p.yearlyPerMonth)} / mois<br />au lieu de {formatPrice(p.monthly)} / mois</>}
            icon={<Gift className="h-5 w-5" aria-hidden />}
          />
        </div>

        <h2 className="mt-8 text-[15px] font-bold text-night-900">Comparer les formules</h2>
        <PlanComparison highlight={plan} className="mt-3" />
        {plan === 'coparentalite' && (
          <p className="mt-3 text-[12px] leading-relaxed text-night-700">
            Accès partagé : chaque parent lié à vos enfants (titulaire ou parent invité) profite des avantages Premium,
            sans abonnement de son côté. Les proches invités n’en bénéficient pas.
          </p>
        )}

        <p className="mt-5 text-center text-[12px] text-night-700">Annulez ou modifiez à tout moment.</p>
        <StripeNote className="mt-2" />
      </div>
    </>
  )
}

function PlanTile({
  selected, href, className, title, price, note, icon, badge, ribbon,
}: {
  selected: boolean
  href: string
  className: string
  title: string
  price: React.ReactNode
  note: React.ReactNode
  icon: React.ReactNode
  badge?: string
  ribbon?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex min-h-[180px] flex-col overflow-hidden rounded-xl2 p-3.5 text-left text-white shadow-card transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-leaf-400',
        selected ? 'ring-2 ring-leaf-500 ring-offset-2' : 'opacity-95 hover:opacity-100',
        className,
      )}
    >
      {ribbon && (
        <span aria-hidden className="absolute right-0 top-0 h-9 w-9 bg-gold-300 [clip-path:polygon(0_0,100%_0,100%_100%)]">
          <Star className="absolute right-1 top-1 h-3.5 w-3.5 fill-night-900 text-night-900" />
        </span>
      )}
      <span className="text-[14px] font-bold">{title}</span>
      {badge && <span className="mt-1.5 w-fit rounded-md bg-gold-300 px-1.5 py-0.5 text-[11px] font-bold text-night-900">{badge}</span>}
      <span className={cn('text-[19px] font-extrabold', badge ? 'mt-1.5' : 'mt-4')}>{price}</span>
      <span className="mt-1.5 text-[11px] leading-snug text-white/90">{note}</span>
      <span aria-hidden className="mx-auto mt-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/10">
        {icon}
      </span>
    </Link>
  )
}

function HeroIllustration() {
  const bubble = 'absolute inline-flex items-center justify-center rounded-full bg-white text-leaf-600 shadow-card ring-1 ring-night-100'
  return (
    <div aria-hidden className="relative mx-auto my-4 h-36 w-64">
      <span className="absolute inset-x-6 bottom-1 top-6 rounded-full bg-gradient-to-b from-leaf-50 to-transparent" />
      <CrownIcon className="absolute left-1/2 top-6 h-20 w-24 -translate-x-1/2" />
      <span className={cn(bubble, 'left-6 top-6 h-9 w-9')}><ShieldCheck className="h-[18px] w-[18px]" /></span>
      <span className={cn(bubble, 'left-12 bottom-6 h-9 w-9')}><CalendarDays className="h-4 w-4" /></span>
      <span className={cn(bubble, 'left-1/2 bottom-0 h-9 w-9 -translate-x-1/2')}><Calendar className="h-4 w-4" /></span>
      <span className={cn(bubble, 'right-12 bottom-7 h-9 w-9')}><Cloud className="h-4 w-4" /></span>
      <span className={cn(bubble, 'right-5 top-9 h-9 w-9')}><Briefcase className="h-4 w-4" /></span>
      <span className="absolute left-[30%] top-1 text-gold-300">✦</span>
      <span className="absolute right-[30%] top-3 text-gold-300">✦</span>
      <span className="absolute left-3 top-16 text-gold-200">✦</span>
    </div>
  )
}
