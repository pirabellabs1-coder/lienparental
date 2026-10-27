// lib/email/templates/calendarShared.ts — Événement partagé ajouté, modifié ou annulé par l'autre parent.
// Titre et date seulement : ni description, ni lieu, ni détail médical.

import { baseLayout } from '../layout'
import { escapeHtml } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appLink, P, preferencesFooter } from './notificationParts'

export type CalendarSharedProps = {
  prenom: string
  /** Phrase complète, déjà dans la langue du destinataire, ex. « Julie a ajouté « Rendez-vous pédiatre de Lina » le 12 nov. à 10h ». */
  sentence: string
  action: 'created' | 'updated' | 'deleted'
  eventId: string
}

const TITLE_KEYS = { created: 'calendarShared.titleCreated', updated: 'calendarShared.titleUpdated', deleted: 'calendarShared.titleDeleted' } as const

export function calendarSharedEmail(props: CalendarSharedProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="margin:0;">${escapeHtml(props.sentence)}.</p>
  `
  const href = props.action === 'deleted' ? appLink('/app/calendrier') : appLink(`/app/calendrier/${encodeURIComponent(props.eventId)}`)
  return {
    subject: props.sentence,
    html: baseLayout({
      locale,
      preheader: props.sentence,
      title: tr(TITLE_KEYS[props.action]),
      body,
      cta: { label: props.action === 'deleted' ? tr('calendarShared.openCalendar') : tr('common.viewEvent'), href },
      footer: preferencesFooter('', locale),
    }),
  }
}
