// lib/email/templates/testimonyReceived.ts — Notification : un nouveau témoignage est arrivé dans le coffre.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'

export type TestimonyReceivedProps = {
  prenom: string
  /** Nom (ou prénom) affiché du témoin. */
  temoinNom: string
  /** Titre de la demande concernée. */
  titreDemande: string
  /** Référence courte de la demande (ex: "DEM-2026-0017"). */
  reference: string
  /** URL du coffre où consulter le témoignage. */
  urlCoffre: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par testimonyReceivedEmail(props, locale). */
export const testimonyReceivedSubject = 'Un nouveau témoignage est arrivé dans votre coffre'

export function testimonyReceivedEmail(props: TestimonyReceivedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const temoinNom = escapeHtml(props.temoinNom)
  const titreDemande = escapeHtml(props.titreDemande)
  const reference = escapeHtml(props.reference)
  const urlCoffre = safeUrl(props.urlCoffre)

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('testimonyReceived.intro', { name: `<strong style="color:${t.colors.night};">${temoinNom}</strong>` })}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;padding:16px;background:${t.colors.pageBg};border:1px solid ${t.colors.border};border-radius:8px;">
      <tr>
        <td style="font-family:${t.font};font-size:14px;color:${t.colors.textMuted};padding:0 0 4px 0;">${tr('testimonyReceived.request')}</td>
      </tr>
      <tr>
        <td style="font-family:${t.font};font-size:16px;color:${t.colors.text};font-weight:600;padding:0 0 8px 0;">${titreDemande}</td>
      </tr>
      <tr>
        <td style="font-family:${t.font};font-size:13px;color:${t.colors.textMuted};">${tr('testimonyReceived.reference', { reference })}</td>
      </tr>
    </table>
    <p style="margin:0;">
      ${tr('testimonyReceived.stored')}
    </p>
  `

  return {
    subject: tr('testimonyReceived.subject'),
    html: baseLayout({
      locale,
      preheader: tr('testimonyReceived.preheader', { name: props.temoinNom, title: props.titreDemande }),
      title: tr('testimonyReceived.title'),
      body,
      cta: { label: tr('testimonyReceived.cta'), href: urlCoffre },
    }),
  }
}
