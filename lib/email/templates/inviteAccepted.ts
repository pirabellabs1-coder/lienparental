// lib/email/templates/inviteAccepted.ts — L'adulte invité a accepté l'invitation.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { appLink, P, preferencesFooter } from './notificationParts'

export type InviteAcceptedProps = {
  prenom: string
  inviteePrenom: string
  role: 'parent' | 'proche'
}

export function inviteAcceptedEmail(props: InviteAcceptedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const who = props.inviteePrenom?.trim() || 'La personne invitée'
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0;">${escapeHtml(who)} a accepté votre invitation (${props.role === 'proche' ? 'proche' : 'parent'}). Vous pouvez gérer les adultes liés et leurs rôles à tout moment.</p>
  `
  return {
    subject: `${who} a accepté votre invitation`,
    html: baseLayout({
      preheader: `${who} a rejoint votre espace partagé.`,
      title: 'Invitation acceptée',
      body,
      cta: { label: 'Gérer la famille', href: appLink('/app/coparents') },
      footer: preferencesFooter(),
    }),
  }
}
