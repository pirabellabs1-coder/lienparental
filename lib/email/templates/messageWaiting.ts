// lib/email/templates/messageWaiting.ts — Messages non lus depuis au moins 5 minutes (un e-mail par conversation et par 30 min au plus).
// Jamais le texte des messages : prénom de l'auteur, nombre de messages, lien.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appLink, P, preferencesFooter } from './notificationParts'

export type MessageWaitingProps = {
  prenom: string
  /** Prénoms des auteurs des messages non lus (déjà dédoublonnés). */
  senders: string[]
  count: number
  conversationId: string
}

export function sendersLabel(senders: string[], locale: Locale = 'fr'): string {
  const tr = emailT(locale)
  const names = senders.map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return tr('common.aParent')
  if (names.length === 1) return names[0]!
  if (names.length === 2) return tr('messageWaiting.sendersTwo', { first: names[0]!, second: names[1]! })
  return tr('messageWaiting.sendersMany', { first: names[0]!, others: String(names.length - 1) })
}

export function messageWaitingEmail(props: MessageWaitingProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const who = sendersLabel(props.senders, locale)
  const count = Math.max(1, Math.floor(props.count))
  const what = tr('messageWaiting.unread', { count })
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const url = appLink(`/app/messages/${encodeURIComponent(props.conversationId)}`)
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="margin:0;">${tr('messageWaiting.body', { name: escapeHtml(who), what: escapeHtml(what) })}</p>
  `
  return {
    subject: tr('messageWaiting.subject', { name: who }),
    html: baseLayout({
      locale,
      preheader: tr('messageWaiting.preheader', { what, name: who }),
      title: tr('messageWaiting.title'),
      body,
      cta: { label: tr('messageWaiting.cta'), href: url },
      footer: preferencesFooter(tr('messageWaiting.footerExtra'), locale),
    }),
  }
}
