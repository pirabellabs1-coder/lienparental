// lib/email/templates/securityChange.ts — Alerte : changement de sécurité du compte (toujours envoyée).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml } from '../escape'
import { dateLocale, emailT, greeting, type Locale } from '../i18n'
import { appLink, P } from './notificationParts'
import { DEFAULT_TZ } from '@/lib/tz'

export type SecurityChangeProps = {
  prenom: string
  /** Titre court, ex. « Votre mot de passe a été modifié » (déjà dans la langue du destinataire). */
  title: string
  /** Phrase d'explication (texte brut, déjà dans la langue du destinataire). */
  message: string
  dateIso: string
  /** Fuseau du destinataire (preferences.ui.fuseau). Absent : DEFAULT_TZ. */
  tz?: string
}

function formatDate(iso: string, locale: Locale, tz: string = DEFAULT_TZ): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'full', timeStyle: 'short', timeZone: tz }).format(d)
}

export function securityChangeEmail(props: SecurityChangeProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="${P}">${escapeHtml(props.message)}</p>
    <p style="${P}color:${t.colors.textMuted};font-size:14px;">${tr('securityChange.dateLine', { date: escapeHtml(formatDate(props.dateIso, locale, props.tz)) })}</p>
    <p style="margin:0;color:${t.colors.alert};font-weight:600;">${tr('securityChange.notYou')}</p>
  `
  return {
    subject: props.title,
    html: baseLayout({
      locale,
      preheader: props.title,
      title: props.title,
      body,
      cta: { label: tr('securityChange.cta'), href: appLink('/app/profil/securite') },
      footer: tr('securityChange.footer'),
    }),
  }
}
