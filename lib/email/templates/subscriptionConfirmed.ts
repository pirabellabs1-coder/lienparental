// lib/email/templates/subscriptionConfirmed.ts — Abonnement Premium confirmé (premier paiement réussi).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'
import { formatDateFr } from './format'

export type SubscriptionConfirmedProps = {
  prenom: string
  /** Libellé de la formule (ex. "Premium annuel"). */
  formule: string
  /** Montant formaté (ex. "99,00 €"). */
  montant: string
  /** Date ISO du prochain prélèvement. */
  nextPaymentIso: string
  /** Facture hébergée Stripe (optionnelle). */
  invoiceUrl?: string | null
}

export const subscriptionConfirmedSubject = 'Votre abonnement Premium est actif'

export function subscriptionConfirmedEmail(props: SubscriptionConfirmedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const formule = escapeHtml(props.formule)
  const montant = escapeHtml(props.montant)
  const next = escapeHtml(formatDateFr(props.nextPaymentIso))
  const appUrl = safeUrl(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`, 'https://lienparental.fr/app/profil/abonnement')
  const invoiceUrl = props.invoiceUrl ? safeUrl(props.invoiceUrl, '', STRIPE_LINK_HOSTS) : ''

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};border-bottom:1px solid ${t.colors.border};">${label}</td>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};text-align:right;border-bottom:1px solid ${t.colors.border};font-weight:600;">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Merci pour votre confiance : votre abonnement <strong>${formule}</strong> est actif.
      ${props.formule.startsWith('Coparentalité+')
        ? 'Toutes les fonctionnalités Premium et Coparentalité+ sont désormais disponibles dans votre espace.'
        : 'Toutes les fonctionnalités Premium sont désormais disponibles dans votre espace.'}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      ${row('Formule', formule)}
      ${row('Montant', montant)}
      ${row('Prochain prélèvement', next)}
    </table>
    ${invoiceUrl ? `<p style="margin:0 0 8px 0;font-size:14px;"><a href="${invoiceUrl}" style="color:${t.colors.iris};">Voir ma facture</a></p>` : ''}
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">
      Vous pouvez changer de formule ou résilier à tout moment depuis Profil &gt; Abonnement.
    </p>
  `

  return {
    subject: props.formule.startsWith('Coparentalité+') ? 'Votre abonnement Coparentalité+ est actif' : subscriptionConfirmedSubject,
    html: baseLayout({
      preheader: `${formule} — prochain prélèvement le ${next}.`,
      title: 'Abonnement confirmé',
      body,
      cta: { label: 'Gérer mon abonnement', href: appUrl },
    }),
  }
}
