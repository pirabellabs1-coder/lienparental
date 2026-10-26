// lib/email/templates/invoice.ts — Récapitulatif de paiement + lien vers la facture Stripe.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'

export type InvoiceProps = {
  prenom: string
  /** Montant déjà formaté (ex: "9,99 €") ou en centimes selon l'appelant. */
  montant: string
  /** Cycle de facturation (ex: "mensuel", "annuel"). */
  cycle: string
  /** Fin de la prochaine période au format ISO 8601. */
  nextPeriodEnd: string
  /** URL hébergée Stripe de la facture (hosted_invoice_url). */
  invoiceUrl: string
}

export const invoiceSubject = 'Votre reçu Lien Parental'

function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d)
  } catch {
    return iso
  }
}

export function invoiceEmail(props: InvoiceProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const dateFin = escapeHtml(formatDateFr(props.nextPeriodEnd))
  const montant = escapeHtml(props.montant)
  const cycle = escapeHtml(props.cycle)
  const invoiceUrl = safeUrl(props.invoiceUrl, undefined, STRIPE_LINK_HOSTS)

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};border-bottom:1px solid ${t.colors.border};">${label}</td>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};text-align:right;border-bottom:1px solid ${t.colors.border};font-weight:600;">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Nous confirmons la réception de votre paiement. Merci pour votre confiance.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      ${row('Montant', montant)}
      ${row('Cycle', cycle)}
      ${row('Prochaine échéance', dateFin)}
    </table>
    <p style="margin:16px 0 0 0;color:${t.colors.textMuted};font-size:14px;">
      Votre facture détaillée est disponible via le bouton ci-dessous. Vous pouvez la télécharger au format PDF depuis la page hébergée par Stripe.
    </p>
  `

  const footer = `
    Pour toute question de facturation, écrivez-nous à
    <a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>.
  `

  return {
    subject: invoiceSubject,
    html: baseLayout({
      preheader: `Reçu Lien Parental — ${montant} (${cycle}).`,
      title: 'Reçu de paiement',
      body,
      cta: { label: 'Télécharger la facture', href: invoiceUrl },
      footer,
    }),
  }
}
