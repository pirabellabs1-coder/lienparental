// lib/email/templates/messageWaiting.ts — Messages non lus depuis au moins 5 minutes (un e-mail par conversation et par 30 min au plus).
// Jamais le texte des messages : prénom de l'auteur, nombre de messages, lien.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { appLink, P, preferencesFooter } from './notificationParts'

export type MessageWaitingProps = {
  prenom: string
  /** Prénoms des auteurs des messages non lus (déjà dédoublonnés). */
  senders: string[]
  count: number
  conversationId: string
}

export function sendersLabel(senders: string[]): string {
  const names = senders.map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return 'Un parent'
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} et ${names[1]}`
  return `${names[0]} et ${names.length - 1} autres personnes`
}

export function messageWaitingEmail(props: MessageWaitingProps): { subject: string; html: string } {
  const who = sendersLabel(props.senders)
  const count = Math.max(1, Math.floor(props.count))
  const what = count > 1 ? `${count} messages non lus` : '1 message non lu'
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const url = appLink(`/app/messages/${encodeURIComponent(props.conversationId)}`)
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0;">${escapeHtml(who)} vous a écrit. Vous avez ${escapeHtml(what)} dans cette conversation.</p>
  `
  return {
    subject: `${who} vous a écrit sur Lien Parental`,
    html: baseLayout({
      preheader: `${what} de ${who}.`,
      title: 'Vous avez un message',
      body,
      cta: { label: 'Lire la conversation', href: url },
      footer: preferencesFooter('Au plus un e-mail par conversation toutes les 30 minutes.'),
    }),
  }
}
