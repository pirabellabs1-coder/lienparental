// lib/email/templates/securityChange.ts — Alerte : changement de sécurité du compte (toujours envoyée).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml } from '../escape'
import { appLink, P } from './notificationParts'
import { DEFAULT_TZ } from '@/lib/tz'

export type SecurityChangeProps = {
  prenom: string
  /** Titre court, ex. « Votre mot de passe a été modifié ». */
  title: string
  /** Phrase d'explication (texte brut). */
  message: string
  dateIso: string
}

function formatDateFr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: DEFAULT_TZ }).format(d)
}

export function securityChangeEmail(props: SecurityChangeProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="${P}">${escapeHtml(props.message)}</p>
    <p style="${P}color:${t.colors.textMuted};font-size:14px;">Date et heure (heure de Guyane) : ${escapeHtml(formatDateFr(props.dateIso))}</p>
    <p style="margin:0;color:${t.colors.alert};font-weight:600;">Ce n'était pas vous ? Sécurisez votre compte sans attendre : changez votre mot de passe et déconnectez les autres appareils.</p>
  `
  return {
    subject: props.title,
    html: baseLayout({
      preheader: props.title,
      title: props.title,
      body,
      cta: { label: 'Vérifier ma sécurité', href: appLink('/app/profil/securite') },
      footer: 'Les alertes de sécurité sont toujours envoyées, quelles que soient vos préférences.',
    }),
  }
}
