// lib/email/templates/calendarReminder.ts — Rappel avant un événement du calendrier (titre seul, jamais la description).

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { appLink, P, preferencesFooter } from './notificationParts'

export type CalendarReminderProps = {
  prenom: string
  titre: string
  /** « le 12 nov. à 10h » (déjà formaté, fuseau de l'application). */
  whenLabel: string
  eventId: string
}

export function calendarReminderEmail(props: CalendarReminderProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const titre = props.titre?.trim() || 'Événement'
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0;">Petit rappel : « ${escapeHtml(titre)} » ${escapeHtml(props.whenLabel)}.</p>
  `
  return {
    subject: `Rappel : ${titre} ${props.whenLabel}`,
    html: baseLayout({
      preheader: `« ${titre} » ${props.whenLabel}.`,
      title: 'Rappel du calendrier',
      body,
      cta: { label: 'Voir l’événement', href: appLink(`/app/calendrier/${encodeURIComponent(props.eventId)}`) },
      footer: preferencesFooter(),
    }),
  }
}
