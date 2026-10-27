// lib/email/templates/paymentFailed.ts — Échec de prélèvement (relances Stripe en cours ou terminées).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { formatDateFr } from './format'

export type PaymentFailedProps = {
  prenom: string
  /** Montant formaté (ex. "11,99 €"). */
  montant: string
  /** Date ISO de la prochaine tentative ; null = plus de relance (dernière tentative). */
  nextAttemptIso: string | null
  /** Facture hébergée Stripe : permet de payer directement avec une autre carte. */
  invoiceUrl?: string | null
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par paymentFailedEmail(props, locale). */
export const paymentFailedSubject = 'Échec du paiement de votre abonnement Lien Parental'

export function paymentFailedEmail(props: PaymentFailedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const montant = escapeHtml(props.montant)
  // Le portail Stripe exige une session authentifiée : le lien mène à l'écran
  // Abonnement, d'où le bouton « Gérer mon moyen de paiement » ouvre le portail.
  const manageUrl = safeUrl(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`,
    'https://lienparental.fr/app/profil/abonnement',
  )
  const invoiceUrl = props.invoiceUrl ? safeUrl(props.invoiceUrl, '', STRIPE_LINK_HOSTS) : ''

  const next = props.nextAttemptIso
    ? `<p style="margin:0 0 16px 0;">${tr('paymentFailed.nextAttempt', { date: `<strong>${escapeHtml(formatDateFr(props.nextAttemptIso, locale))}</strong>` })}</p>`
    : `<p style="margin:0 0 16px 0;color:${t.colors.alert};font-weight:600;">${tr('paymentFailed.lastAttempt')}</p>`

  const payLink = `<a href="${invoiceUrl}" style="color:${t.colors.link};">${tr('paymentFailed.payOnlineLink')}</a>`
  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('paymentFailed.intro1', { amount: `<strong>${montant}</strong>` })}
      ${tr('paymentFailed.intro2')}
    </p>
    ${next}
    <p style="margin:0 0 8px 0;">${tr('paymentFailed.update')}</p>
    ${invoiceUrl ? `<p style="margin:0;font-size:14px;">${tr('paymentFailed.payOnline', { link: payLink })}</p>` : ''}
  `

  const mail = `<a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>`
  return {
    subject: tr('paymentFailed.subject'),
    html: baseLayout({
      locale,
      preheader: tr('paymentFailed.preheader', { amount: props.montant }),
      title: tr('paymentFailed.title'),
      body,
      cta: { label: tr('paymentFailed.cta'), href: manageUrl },
      footer: tr('paymentFailed.footer', { email: mail }),
    }),
  }
}
