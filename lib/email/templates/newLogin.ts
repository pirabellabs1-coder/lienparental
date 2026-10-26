// lib/email/templates/newLogin.ts — M11 : alerte nouvelle connexion détectée.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'

export type NewLoginProps = {
  prenom: string
  /** Nom de l'appareil (ex: "iPhone 14", "MacBook Pro"). */
  appareil: string
  /** Localisation approximative (ex: "Lyon, France"). */
  lieu: string
  /** Système / navigateur (ex: "Safari sur iOS 17"). */
  systeme: string
  /** Date au format ISO 8601. */
  dateIso: string
}

export const newLoginSubject = 'Nouvelle connexion à votre compte Lien Parental'

function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Cayenne',
    }).format(d)
  } catch {
    return iso
  }
}

export function newLoginEmail(props: NewLoginProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const date = escapeHtml(formatDateFr(props.dateIso))
  const appareil = escapeHtml(props.appareil)
  const lieu = escapeHtml(props.lieu)
  const systeme = escapeHtml(props.systeme)
  const notYouUrl = safeUrl(
    (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/compte/securite',
    'https://lienparental.fr/compte/securite'
  )

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};width:120px;">${label}</td>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Nous avons détecté une nouvelle connexion à votre compte Lien Parental. Si c'était bien vous, aucune action n'est nécessaire.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-top:1px solid ${t.colors.border};border-bottom:1px solid ${t.colors.border};">
      ${row('Appareil', appareil)}
      ${row('Système', systeme)}
      ${row('Lieu', lieu)}
      ${row('Date', date)}
    </table>
    <p style="margin:0 0 8px 0;color:${t.colors.alert};font-weight:600;">
      Ce n'était pas vous ?
    </p>
    <p style="margin:0;">
      <a href="${notYouUrl}" style="color:${t.colors.alert};text-decoration:underline;font-weight:600;">
        Sécuriser mon compte immédiatement
      </a> :
      nous vous aiderons à révoquer les sessions actives et à changer votre mot de passe.
    </p>
  `

  return {
    subject: newLoginSubject,
    html: baseLayout({
      preheader: `Nouvelle connexion depuis ${appareil} (${lieu}).`,
      title: 'Nouvelle connexion détectée',
      body,
    }),
  }
}
