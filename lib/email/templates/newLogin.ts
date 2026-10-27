// lib/email/templates/newLogin.ts — M11 : alerte nouvelle connexion détectée.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { dateLocale, emailT, greeting, type Locale } from '../i18n'

export type NewLoginProps = {
  prenom: string
  /** Nom de l'appareil (ex: "iPhone 14", "MacBook Pro"). */
  appareil: string
  /** Localisation approximative (ex: "Lyon, France"). Omise : ligne masquée (aucune géolocalisation tierce). */
  lieu?: string
  /** Système / navigateur (ex: "Safari sur iOS 17"). */
  systeme: string
  /** Date au format ISO 8601. */
  dateIso: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par newLoginEmail(props, locale). */
export const newLoginSubject = 'Nouvelle connexion à votre compte Lien Parental'

function formatDate(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(dateLocale(locale), {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Cayenne',
    }).format(d)
  } catch {
    return iso
  }
}

export function newLoginEmail(props: NewLoginProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const date = escapeHtml(formatDate(props.dateIso, locale))
  const appareil = escapeHtml(props.appareil)
  const lieu = props.lieu?.trim() ? escapeHtml(props.lieu.trim()) : ''
  const systeme = escapeHtml(props.systeme)
  const notYouUrl = safeUrl(
    (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/app/profil/securite',
    'https://lienparental.fr/app/profil/securite'
  )

  // Français : mise en forme historique conservée à l'identique ; autres langues : pas d'espace avant le deux-points.
  const secureLabel = locale === 'fr' ? `
        ${tr('newLogin.secure')}
      ` : tr('newLogin.secure')

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.textMuted};width:120px;">${label}</td>
      <td style="padding:8px 0;font-family:${t.font};font-size:14px;color:${t.colors.text};">${value}</td>
    </tr>
  `

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('newLogin.intro')}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-top:1px solid ${t.colors.border};border-bottom:1px solid ${t.colors.border};">
      ${row(tr('newLogin.device'), appareil)}
      ${row(tr('newLogin.system'), systeme)}
      ${lieu ? row(tr('newLogin.place'), lieu) : ''}
      ${row(tr('newLogin.date'), date)}
    </table>
    <p style="margin:0 0 8px 0;color:${t.colors.alert};font-weight:600;">
      ${tr('newLogin.notYou')}
    </p>
    <p style="margin:0;">
      <a href="${notYouUrl}" style="color:${t.colors.alert};text-decoration:underline;font-weight:600;">${secureLabel}</a>${tr('common.colon')}
      ${tr('newLogin.secureAfter')}
    </p>
  `

  return {
    subject: tr('newLogin.subject'),
    html: baseLayout({
      locale,
      preheader: props.lieu?.trim()
        ? tr('newLogin.preheaderPlace', { device: props.appareil, place: props.lieu.trim() })
        : tr('newLogin.preheader', { device: props.appareil }),
      title: tr('newLogin.title'),
      body,
    }),
  }
}
