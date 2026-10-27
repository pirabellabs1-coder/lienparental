// lib/email/templates/inviteAccepted.ts — L'adulte invité a accepté l'invitation.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appLink, P, preferencesFooter } from './notificationParts'

export type InviteAcceptedProps = {
  prenom: string
  inviteePrenom: string
  role: 'parent' | 'proche'
}

export function inviteAcceptedEmail(props: InviteAcceptedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const who = props.inviteePrenom?.trim() || tr('inviteAccepted.someone')
  const role = props.role === 'proche' ? tr('inviteAccepted.roleProche') : tr('inviteAccepted.roleParent')
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="margin:0;">${tr('inviteAccepted.body', { name: escapeHtml(who), role })}</p>
  `
  return {
    subject: tr('inviteAccepted.subject', { name: who }),
    html: baseLayout({
      locale,
      preheader: tr('inviteAccepted.preheader', { name: who }),
      title: tr('inviteAccepted.title'),
      body,
      cta: { label: tr('common.manageFamily'), href: appLink('/app/coparents') },
      footer: preferencesFooter('', locale),
    }),
  }
}
