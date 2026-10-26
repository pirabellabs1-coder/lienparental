// lib/email/templates/subscriptionCanceled.ts — Résiliation programmée ou effective.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { formatDateFr } from './format'

export type SubscriptionCanceledProps = {
  prenom: string
  /**
   * 'scheduled' : résiliation demandée, Premium actif jusqu'à `endIso`.
   * 'ended' : l'abonnement a pris fin (fin de période ou impayé).
   */
  kind: 'scheduled' | 'ended'
  /** Date ISO de fin des avantages Premium. */
  endIso: string | null
}

export function subscriptionCanceledEmail(props: SubscriptionCanceledProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const end = props.endIso ? escapeHtml(formatDateFr(props.endIso)) : ''
  const url = safeUrl(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`,
    'https://lienparental.fr/app/profil/abonnement',
  )

  const scheduled = props.kind === 'scheduled'
  const subject = scheduled ? 'Confirmation de votre résiliation' : 'Votre abonnement Premium a pris fin'

  const body = scheduled
    ? `
      <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
      <p style="margin:0 0 16px 0;">
        Nous confirmons la résiliation de votre abonnement Premium. Aucun nouveau prélèvement ne sera effectué.
      </p>
      <p style="margin:0 0 16px 0;">
        Vos avantages Premium restent actifs${end ? ` jusqu'au <strong>${end}</strong>` : ' jusqu’à la fin de la période en cours'}.
        Vous pouvez annuler cette résiliation à tout moment d'ici là.
      </p>`
    : `
      <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
      <p style="margin:0 0 16px 0;">
        Votre abonnement Premium a pris fin${end ? ` le <strong>${end}</strong>` : ''}. Votre compte est repassé à l'offre gratuite.
      </p>
      <p style="margin:0 0 16px 0;">
        Toutes vos données restent conservées et consultables. Au-delà des limites de l'offre gratuite,
        l'ajout de nouveaux contenus nécessite de vous réabonner.
      </p>`

  return {
    subject,
    html: baseLayout({
      preheader: scheduled ? `Premium actif jusqu'au ${end || 'terme de la période'}.` : 'Votre compte est repassé à l’offre gratuite.',
      title: scheduled ? 'Résiliation enregistrée' : 'Abonnement terminé',
      body,
      cta: { label: scheduled ? 'Gérer mon abonnement' : 'Me réabonner', href: url },
      footer: `Une question ? <a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>`,
    }),
  }
}
