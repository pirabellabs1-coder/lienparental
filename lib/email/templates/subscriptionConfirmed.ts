// lib/email/templates/subscriptionConfirmed.ts — Abonnement Premium confirmé (premier paiement réussi).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'
import { emailT, greeting, planName, type Locale } from '../i18n'
import { formatDateFr } from './format'

export type SubscriptionConfirmedProps = {
  prenom: string
  /** Libellé de la formule (ex. "Premium annuel" : libellés connus traduits). */
  formule: string
  /** Montant formaté (ex. "99,00 €"). */
  montant: string
  /** Date ISO du prochain prélèvement. */
  nextPaymentIso: string
  /** Facture hébergée Stripe (optionnelle). */
  invoiceUrl?: string | null
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par subscriptionConfirmedEmail(props, locale). */
export const subscriptionConfirmedSubject = 'Votre abonnement Premium est actif'

export function subscriptionConfirmedEmail(props: SubscriptionConfirmedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const copa = props.formule.startsWith('Coparentalité+')
  const planText = planName(tr, props.formule)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const formule = escapeHtml(planText)
  const montant = escapeHtml(props.montant)
  const next = escapeHtml(formatDateFr(props.nextPaymentIso, locale))
  const appUrl = safeUrl(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`, 'https://lienparental.fr/app/profil/abonnement')
  const invoiceUrl = props.invoiceUrl ? safeUrl(props.invoiceUrl, '', STRIPE_LINK_HOSTS) : ''

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};border-bottom:1px solid ${t.colors.border};">${label}</td>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};text-align:right;border-bottom:1px solid ${t.colors.border};font-weight:600;">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('subscriptionConfirmed.intro', { plan: `<strong>${formule}</strong>` })}
      ${copa
        ? tr('subscriptionConfirmed.featuresCopa')
        : tr('subscriptionConfirmed.features')}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      ${row(tr('subscriptionConfirmed.plan'), formule)}
      ${row(tr('subscriptionConfirmed.amount'), montant)}
      ${row(tr('subscriptionConfirmed.nextPayment'), next)}
    </table>
    ${invoiceUrl ? `<p style="margin:0 0 8px 0;font-size:14px;"><a href="${invoiceUrl}" style="color:${t.colors.link};">${tr('subscriptionConfirmed.viewInvoice')}</a></p>` : ''}
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">
      ${tr('subscriptionConfirmed.manageHint')}
    </p>
  `

  return {
    subject: copa ? tr('subscriptionConfirmed.subjectCopa') : tr('subscriptionConfirmed.subject'),
    html: baseLayout({
      locale,
      preheader: tr('subscriptionConfirmed.preheader', { plan: planText, date: formatDateFr(props.nextPaymentIso, locale) }),
      title: tr('subscriptionConfirmed.title'),
      body,
      cta: { label: tr('common.manageSubscription'), href: appUrl },
    }),
  }
}
