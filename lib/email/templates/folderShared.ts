// lib/email/templates/folderShared.ts — Un parent lié a partagé un dossier du coffre (nom du dossier jamais affiché).

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { appLink, P, preferencesFooter } from './notificationParts'

export type FolderSharedProps = {
  prenom: string
  ownerPrenom: string
  folderId: string
}

export function folderSharedEmail(props: FolderSharedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const who = props.ownerPrenom?.trim() || 'Un parent'
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0;">${escapeHtml(who)} a partagé un dossier de son coffre-fort avec vous, en lecture seule.</p>
  `
  return {
    subject: `${who} a partagé un dossier avec vous`,
    html: baseLayout({
      preheader: `Un dossier partagé par ${who} vous attend.`,
      title: 'Dossier partagé',
      body,
      cta: { label: 'Ouvrir le dossier', href: appLink(`/app/coffre/dossiers/${encodeURIComponent(props.folderId)}`) },
      footer: preferencesFooter(),
    }),
  }
}
