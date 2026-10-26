// lib/email/templates/paymentFailed.ts — Échec de prélèvement (relances Stripe en cours ou terminées).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'
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

export const paymentFailedSubject = 'Échec du paiement de votre abonnement Lien Parental'

export function paymentFailedEmail(props: PaymentFailedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const montant = escapeHtml(props.montant)
  // Le portail Stripe exige une session authentifiée : le lien mène à l'écran
  // Abonnement, d'où le bouton « Gérer mon moyen de paiement » ouvre le portail.
  const manageUrl = safeUrl(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`,
    'https://lienparental.fr/app/profil/abonnement',
  )
  const invoiceUrl = props.invoiceUrl ? safeUrl(props.invoiceUrl, '', STRIPE_LINK_HOSTS) : ''

  const next = props.nextAttemptIso
    ? `<p style="margin:0 0 16px 0;">Une nouvelle tentative aura lieu automatiquement le <strong>${escapeHtml(formatDateFr(props.nextAttemptIso))}</strong>. Vos avantages Premium restent actifs d'ici là.</p>`
    : `<p style="margin:0 0 16px 0;color:${t.colors.alert};font-weight:600;">C'était la dernière tentative : sans régularisation, votre compte repassera à l'offre gratuite. Vos données restent conservées et consultables.</p>`

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Nous n'avons pas pu prélever <strong>${montant}</strong> pour votre abonnement Premium
      (carte expirée, plafond atteint ou refus de la banque, par exemple).
    </p>
    ${next}
    <p style="margin:0 0 8px 0;">Pour éviter toute interruption, mettez à jour votre moyen de paiement.</p>
    ${invoiceUrl ? `<p style="margin:0;font-size:14px;">Vous pouvez aussi <a href="${invoiceUrl}" style="color:${t.colors.iris};">régler la facture en ligne</a>.</p>` : ''}
  `

  return {
    subject: paymentFailedSubject,
    html: baseLayout({
      preheader: `Le paiement de ${montant} n'a pas abouti.`,
      title: 'Votre paiement n’a pas abouti',
      body,
      cta: { label: 'Mettre à jour mon moyen de paiement', href: manageUrl },
      footer: `Besoin d'aide ? Écrivez-nous à <a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>.`,
    }),
  }
}
