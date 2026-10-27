// lib/email/templates/invoice.ts — Récapitulatif de paiement + lien vers la facture Stripe.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl, STRIPE_LINK_HOSTS } from '../escape'
import { cycleLabel, dateLocale, emailT, greeting, type Locale } from '../i18n'

export type InvoiceProps = {
  prenom: string
  /** Montant déjà formaté (ex: "9,99 €") ou en centimes selon l'appelant. */
  montant: string
  /** Cycle de facturation (ex: "mensuel", "annuel" : traduits ; autre valeur affichée telle quelle). */
  cycle: string
  /** Fin de la prochaine période au format ISO 8601. */
  nextPeriodEnd: string
  /** URL hébergée Stripe de la facture (hosted_invoice_url). */
  invoiceUrl: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par invoiceEmail(props, locale). */
export const invoiceSubject = 'Votre reçu Lien Parental'

function formatDate(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'long' }).format(d)
  } catch {
    return iso
  }
}

export function invoiceEmail(props: InvoiceProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const dateFin = escapeHtml(formatDate(props.nextPeriodEnd, locale))
  const montant = escapeHtml(props.montant)
  const cycleText = cycleLabel(tr, props.cycle)
  const cycle = escapeHtml(cycleText)
  const invoiceUrl = safeUrl(props.invoiceUrl, undefined, STRIPE_LINK_HOSTS)

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};border-bottom:1px solid ${t.colors.border};">${label}</td>
      <td style="padding:10px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};text-align:right;border-bottom:1px solid ${t.colors.border};font-weight:600;">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('invoice.intro')}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      ${row(tr('invoice.amount'), montant)}
      ${row(tr('invoice.cycle'), cycle)}
      ${row(tr('invoice.nextDue'), dateFin)}
    </table>
    <p style="margin:16px 0 0 0;color:${t.colors.textMuted};font-size:14px;">
      ${tr('invoice.details')}
    </p>
  `

  const footer = `
    ${tr('invoice.footerLead')}
    <a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>.
  `

  return {
    subject: tr('invoice.subject'),
    html: baseLayout({
      locale,
      preheader: tr('invoice.preheader', { amount: props.montant, cycle: cycleText }),
      title: tr('invoice.title'),
      body,
      cta: { label: tr('invoice.cta'), href: invoiceUrl },
      footer,
    }),
  }
}
