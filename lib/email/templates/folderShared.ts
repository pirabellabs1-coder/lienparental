// lib/email/templates/folderShared.ts — Un parent lié a partagé un dossier du coffre (nom du dossier jamais affiché).

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appLink, P, preferencesFooter } from './notificationParts'

export type FolderSharedProps = {
  prenom: string
  ownerPrenom: string
  folderId: string
}

export function folderSharedEmail(props: FolderSharedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const who = props.ownerPrenom?.trim() || tr('common.aParent')
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="margin:0;">${tr('folderShared.body', { name: escapeHtml(who) })}</p>
  `
  return {
    subject: tr('folderShared.subject', { name: who }),
    html: baseLayout({
      locale,
      preheader: tr('folderShared.preheader', { name: who }),
      title: tr('folderShared.title'),
      body,
      cta: { label: tr('folderShared.cta'), href: appLink(`/app/coffre/dossiers/${encodeURIComponent(props.folderId)}`) },
      footer: preferencesFooter('', locale),
    }),
  }
}
