import { AlertCircle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Banner } from '@/components/profil/kit'
import { BILLING_ERROR_MESSAGES } from '@/lib/billing/client'
import { billingError } from './billing-i18n'

/**
 * Bandeau d'erreur / d'information des écrans abonnement.
 * `code` provient de `?erreur=<code>` (retour 303 des routes /api/stripe/*) :
 * seul le libellé connu est affiché, jamais la valeur brute de l'URL.
 */
export function BillingNotice({ code, info, className }: { code?: string | null; info?: string | null; className?: string }) {
  const t = useTranslations('billing')
  if (code) {
    return (
      <div role="alert" className={className}>
        <Banner tone="red" icon={<AlertCircle className="h-5 w-5" />} title={t('errors.title')}>
          {billingError(t, code, BILLING_ERROR_MESSAGES)}
        </Banner>
      </div>
    )
  }
  if (info) {
    return (
      <div role="status" className={className}>
        <Banner tone="night" icon={<Info className="h-5 w-5" />}>{info}</Banner>
      </div>
    )
  }
  return null
}

export function firstParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && /^[a-z_]{1,40}$/.test(s) ? s : null
}
