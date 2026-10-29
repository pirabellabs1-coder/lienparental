// lib/email/templates/partnerApplication.ts — Candidature « Devenir partenaire » reçue.
// E-mail interne envoyé à partenaires@lienparental.fr (reply-to = adresse du candidat).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml } from '../escape'
import type { PartnerApplication } from '@/lib/partenaires/types'

export type PartnerApplicationProps = PartnerApplication & {
  /** Date de réception ISO, imposée par l'appelant (idempotence et horodatage). */
  receivedAtIso: string
  /** IP tronquée / « unknown », servie dans l'en-tête technique de l'e-mail. */
  ipBucket: string
}

function profileLabel(p: PartnerApplication['profil']): string {
  switch (p) {
    case 'association': return 'Association'
    case 'institution': return 'Institution ou organisme public'
    case 'professionnel': return 'Professionnel ou prestataire'
    case 'createur': return 'Créateur de contenu ou influenceur'
  }
}

function territoryLabel(code: PartnerApplication['territoire']): string {
  switch (code) {
    case 'guyane': return 'Guyane'
    case 'france': return 'France métropolitaine'
    case 'martinique': return 'Martinique'
    case 'guadeloupe': return 'Guadeloupe'
    case 'reunion': return 'La Réunion'
    case 'mayotte': return 'Mayotte'
    case 'autre': return 'Autre'
  }
}

/** Transforme un bloc multiligne en HTML sûr avec sauts de ligne. */
function paragraph(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

export function partnerApplicationEmail(props: PartnerApplicationProps): { subject: string; html: string } {
  const structure = escapeHtml(props.structure)
  const contact = escapeHtml(props.contactName)
  const email = escapeHtml(props.email)
  const telephone = props.telephone ? escapeHtml(props.telephone) : ''
  const territoire = escapeHtml(territoryLabel(props.territoire))
  const profil = escapeHtml(profileLabel(props.profil))
  // Site du candidat : texte brut échappé, jamais un lien cliquable (adresse tierce non vérifiée ;
  // safeUrl n'autorise d'ailleurs que les liens vers l'application).
  const site = props.site ? escapeHtml(props.site) : ''
  const reseaux = props.reseaux ? paragraph(props.reseaux) : ''
  const presentation = paragraph(props.presentation)
  const proposition = paragraph(props.proposition)
  const date = escapeHtml(new Date(props.receivedAtIso).toISOString())
  const ip = escapeHtml(props.ipBucket)

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};width:200px;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">Nouvelle candidature partenaire reçue sur <strong>lienparental.fr</strong>.</p>
    <h2 style="margin:24px 0 8px 0;font-size:16px;color:${t.colors.text};">Profil et coordonnées</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${t.colors.border};border-bottom:1px solid ${t.colors.border};">
      ${row('Type de structure', profil)}
      ${row('Nom de la structure', structure)}
      ${row('Contact', contact)}
      ${row('E-mail', `<a href="mailto:${email}" style="color:${t.colors.link};">${email}</a>`)}
      ${telephone ? row('Téléphone', telephone) : ''}
      ${row('Territoire principal', territoire)}
    </table>
    <h2 style="margin:24px 0 8px 0;font-size:16px;color:${t.colors.text};">Activité</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${t.colors.border};border-bottom:1px solid ${t.colors.border};">
      ${site ? row('Site internet', site) : ''}
      ${reseaux ? row('Réseaux sociaux', reseaux) : ''}
      ${row('Présentation', presentation)}
    </table>
    <h2 style="margin:24px 0 8px 0;font-size:16px;color:${t.colors.text};">Proposition</h2>
    <p style="margin:0 0 16px 0;white-space:pre-wrap;">${proposition}</p>
    <p style="margin:24px 0 0 0;font-size:12px;color:${t.colors.textMuted};">
      Reçue le ${date} · IP ${ip}.<br>
      Répondez directement à cet e-mail : le reply-to pointe vers l'adresse du candidat.
    </p>
  `

  return {
    // Objet et préheader en texte brut : cleanSubject et baseLayout les neutralisent (pas de double échappement).
    subject: `Candidature partenaire — ${profileLabel(props.profil)} — ${props.structure}`,
    html: baseLayout({
      locale: 'fr',
      preheader: `${profileLabel(props.profil)} · ${props.structure} · ${territoryLabel(props.territoire)}`,
      title: 'Nouvelle candidature partenaire',
      body,
    }),
  }
}
