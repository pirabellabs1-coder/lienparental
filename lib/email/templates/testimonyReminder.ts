// lib/email/templates/testimonyReminder.ts — Relance adressée au témoin qui n'a pas encore répondu.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'

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

export const testimonyReminderSubject = 'Rappel : un parent attend votre témoignage'

function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d)
  } catch {
    return iso
  }
}

export function testimonyReminderEmail(props: TestimonyReminderProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenomTemoin?.trim() || '')
  const date = escapeHtml(formatDateFr(props.dateLimite))
  const parentNom = escapeHtml(props.parentNom)
  const titreDemande = escapeHtml(props.titreDemande)
  const url = safeUrl(props.url)

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="margin:0 0 16px 0;">
      <strong style="color:${t.colors.night};">${parentNom}</strong> vous a sollicité pour témoigner dans le cadre d'une démarche familiale importante : <em>${titreDemande}</em>.
    </p>
    <p style="margin:0 0 16px 0;">
      Votre regard, même en quelques lignes, peut faire une vraie différence. Le dépôt est sécurisé et confidentiel : seul le parent concerné aura accès à votre témoignage.
    </p>
    <p style="margin:0 0 16px 0;padding:12px 16px;background:${t.colors.pageBg};border-left:4px solid ${t.colors.gold};border-radius:4px;font-size:14px;color:${t.colors.text};">
      Merci de déposer votre témoignage avant le <strong>${date}</strong>.
    </p>
  `

  const footer = `
    Vous ne souhaitez pas témoigner ? Vous pouvez ignorer cet email, aucun rappel supplémentaire ne vous sera envoyé après la date limite.
  `

  return {
    subject: testimonyReminderSubject,
    html: baseLayout({
      preheader: `${props.parentNom} attend votre témoignage avant le ${formatDateFr(props.dateLimite)}.`,
      title: 'Un témoignage est attendu',
      body,
      cta: { label: 'Déposer mon témoignage', href: url },
      footer,
    }),
  }
}
