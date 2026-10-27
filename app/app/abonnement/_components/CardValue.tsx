import { useTranslations } from 'next-intl'
import { VisaMark } from '@/components/profil/PaymentBrands'
import { formatCardBrand, type BillingCard } from '@/lib/billing/types'

/** Valeur « Moyen de paiement » : marque + 4 derniers chiffres (jamais plus). */
export function CardValue({ card }: { card: BillingCard | null }) {
  const t = useTranslations('billing.card')
  if (!card) return <span className="text-night-600">{t('managedByStripe')}</span>
  const brand = formatCardBrand(card.brand)
  return (
    <span className="inline-flex items-center gap-2">
      {card.brand.toLowerCase() === 'visa'
        ? <VisaMark className="h-6 px-1.5 text-[11px]" />
        : <span aria-hidden className="rounded-md border border-night-100 px-1.5 py-0.5 text-[11px] font-bold">{brand}</span>}
      <span aria-hidden>•••• {card.last4}</span>
      <span className="sr-only">{t('endingIn', { brand, last4: card.last4 })}</span>
    </span>
  )
}
