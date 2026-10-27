// lib/email/templates/calendarShared.ts — Événement partagé ajouté, modifié ou annulé par l'autre parent.
// Titre et date seulement : ni description, ni lieu, ni détail médical.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { appLink, P, preferencesFooter } from './notificationParts'

export type CalendarSharedProps = {
  prenom: string
  /** Phrase complète, ex. « Julie a ajouté « Rendez-vous pédiatre de Lina » le 12 nov. à 10h ». */
  sentence: string
  action: 'created' | 'updated' | 'deleted'
  eventId: string
}

const TITLES = { created: 'Nouvel événement partagé', updated: 'Événement partagé modifié', deleted: 'Événement partagé annulé' } as const

export function calendarSharedEmail(props: CalendarSharedProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0;">${escapeHtml(props.sentence)}.</p>
  `
  const href = props.action === 'deleted' ? appLink('/app/calendrier') : appLink(`/app/calendrier/${encodeURIComponent(props.eventId)}`)
  return {
    subject: props.sentence,
    html: baseLayout({
      preheader: props.sentence,
      title: TITLES[props.action],
      body,
      cta: { label: props.action === 'deleted' ? 'Ouvrir le calendrier' : 'Voir l’événement', href },
      footer: preferencesFooter(),
    }),
  }
}
