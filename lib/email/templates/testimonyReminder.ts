// lib/email/templates/testimonyReminder.ts — Relance adressée au témoin qui n'a pas encore répondu.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { dateLocale, emailT, greeting, type Locale } from '../i18n'

export type TestimonyReminderProps = {
  prenomTemoin: string
  /** Nom du parent qui a sollicité le témoin. */
  parentNom: string
  /** Titre de la demande. */
  titreDemande: string
  /** URL pour déposer le témoignage. */
  url: string
  /** Date limite au format ISO 8601. */
  dateLimite: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par testimonyReminderEmail(props, locale). */
export const testimonyReminderSubject = 'Rappel : un parent attend votre témoignage'

function formatDate(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'long' }).format(d)
  } catch {
    return iso
  }
}

export function testimonyReminderEmail(props: TestimonyReminderProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenomTemoin?.trim() || '')
  const date = escapeHtml(formatDate(props.dateLimite, locale))
  const parentNom = escapeHtml(props.parentNom)
  const titreDemande = escapeHtml(props.titreDemande)
  const url = safeUrl(props.url)

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('testimonyReminder.intro', { parent: `<strong style="color:${t.colors.night};">${parentNom}</strong>`, title: `<em>${titreDemande}</em>` })}
    </p>
    <p style="margin:0 0 16px 0;">
      ${tr('testimonyReminder.value')}
    </p>
    <p style="margin:0 0 16px 0;padding:12px 16px;background:${t.colors.pageBg};border-left:4px solid ${t.colors.gold};border-radius:4px;font-size:14px;color:${t.colors.text};">
      ${tr('testimonyReminder.deadline', { date: `<strong>${date}</strong>` })}
    </p>
  `

  const footer = `
    ${tr('testimonyReminder.footer')}
  `

  return {
    subject: tr('testimonyReminder.subject'),
    html: baseLayout({
      locale,
      preheader: tr('testimonyReminder.preheader', { parent: props.parentNom, date: formatDate(props.dateLimite, locale) }),
      title: tr('testimonyReminder.title'),
      body,
      cta: { label: tr('testimonyReminder.cta'), href: url },
      footer,
    }),
  }
}
