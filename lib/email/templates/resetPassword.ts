// lib/email/templates/resetPassword.ts — Lien de réinitialisation du mot de passe (valable 60 min).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'

export type ResetPasswordProps = {
  prenom: string
  /** URL complète du lien de réinitialisation (signé, à usage unique). */
  url: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par resetPasswordEmail(props, locale). */
export const resetPasswordSubject = 'Réinitialisation de votre mot de passe Lien Parental'

export function resetPasswordEmail(props: ResetPasswordProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const url = safeUrl(props.url)

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('resetPassword.intro1')}
      ${tr('resetPassword.intro2')}
    </p>
    <p style="margin:0 0 16px 0;color:${t.colors.textMuted};font-size:14px;">
      ${tr('resetPassword.validity')}
    </p>
  `

  const mail = `<a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>`
  const footer = `
    ${tr('resetPassword.footer1')}
    ${tr('resetPassword.footer2', { email: mail })}
  `

  return {
    subject: tr('resetPassword.subject'),
    html: baseLayout({
      locale,
      preheader: tr('resetPassword.preheader'),
      title: tr('resetPassword.title'),
      body,
      cta: { label: tr('resetPassword.cta'), href: url },
      footer,
    }),
  }
}
