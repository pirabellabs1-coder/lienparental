// lib/email/templates/resetPassword.ts — Lien de réinitialisation du mot de passe (valable 60 min).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'

export type ResetPasswordProps = {
  prenom: string
  /** URL complète du lien de réinitialisation (signé, à usage unique). */
  url: string
}

export const resetPasswordSubject = 'Réinitialisation de votre mot de passe Lien Parental'

export function resetPasswordEmail(props: ResetPasswordProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const url = safeUrl(props.url)

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Vous avez demandé à réinitialiser le mot de passe de votre compte Lien Parental.
      Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
    </p>
    <p style="margin:0 0 16px 0;color:${t.colors.textMuted};font-size:14px;">
      Ce lien est valable 60 minutes et ne peut être utilisé qu'une seule fois.
    </p>
  `

  const footer = `
    Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.
    En cas de doute, contactez-nous à <a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>.
  `

  return {
    subject: resetPasswordSubject,
    html: baseLayout({
      preheader: 'Lien de réinitialisation valable 60 minutes.',
      title: 'Réinitialiser votre mot de passe',
      body,
      cta: { label: 'Choisir un nouveau mot de passe', href: url },
      footer,
    }),
  }
}
