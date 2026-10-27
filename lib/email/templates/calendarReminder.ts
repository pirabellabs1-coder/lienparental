// lib/email/templates/calendarReminder.ts — Rappel avant un événement du calendrier (titre seul, jamais la description).

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appLink, P, preferencesFooter } from './notificationParts'

export type CalendarReminderProps = {
  prenom: string
  titre: string
  /** « le 12 nov. à 10h » (déjà formaté dans la langue du destinataire, fuseau de l'application). */
  whenLabel: string
  eventId: string
}

export function calendarReminderEmail(props: CalendarReminderProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const titre = props.titre?.trim() || tr('calendarReminder.defaultTitle')
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="margin:0;">${tr('calendarReminder.body', { title: escapeHtml(titre), when: escapeHtml(props.whenLabel) })}</p>
  `
  return {
    subject: tr('calendarReminder.subject', { title: titre, when: props.whenLabel }),
    html: baseLayout({
      locale,
      preheader: tr('calendarReminder.preheader', { title: titre, when: props.whenLabel }),
      title: tr('calendarReminder.title'),
      body,
      cta: { label: tr('common.viewEvent'), href: appLink(`/app/calendrier/${encodeURIComponent(props.eventId)}`) },
      footer: preferencesFooter('', locale),
    }),
  }
}
