// lib/email/templates/testimonyReceived.ts — Notification : un nouveau témoignage est arrivé dans le coffre.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'

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

export const testimonyReceivedSubject = 'Un nouveau témoignage est arrivé dans votre coffre'

export function testimonyReceivedEmail(props: TestimonyReceivedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const temoinNom = escapeHtml(props.temoinNom)
  const titreDemande = escapeHtml(props.titreDemande)
  const reference = escapeHtml(props.reference)
  const urlCoffre = safeUrl(props.urlCoffre)

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0 0 16px 0;">
      Bonne nouvelle : <strong style="color:${t.colors.night};">${temoinNom}</strong> vient de déposer un témoignage dans votre coffre sécurisé.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;padding:16px;background:${t.colors.pageBg};border:1px solid ${t.colors.border};border-radius:8px;">
      <tr>
        <td style="font-family:${t.font};font-size:14px;color:${t.colors.textMuted};padding:0 0 4px 0;">Demande</td>
      </tr>
      <tr>
        <td style="font-family:${t.font};font-size:16px;color:${t.colors.text};font-weight:600;padding:0 0 8px 0;">${titreDemande}</td>
      </tr>
      <tr>
        <td style="font-family:${t.font};font-size:13px;color:${t.colors.textMuted};">Référence : ${reference}</td>
      </tr>
    </table>
    <p style="margin:0;">
      Il est rangé dans votre coffre-fort, visible uniquement par vous. Prenez le temps nécessaire pour le lire, rien ne presse.
    </p>
  `

  return {
    subject: testimonyReceivedSubject,
    html: baseLayout({
      preheader: `${props.temoinNom} a déposé un témoignage pour « ${props.titreDemande} ».`,
      title: 'Nouveau témoignage reçu',
      body,
      cta: { label: 'Consulter dans mon coffre', href: urlCoffre },
    }),
  }
}
