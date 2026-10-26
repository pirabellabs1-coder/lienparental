// lib/email/templates/verification.ts — M02 : code à 6 chiffres pour vérifier l'adresse email.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml } from '../escape'

export type VerificationProps = {
  prenom: string
  /** Code à 6 chiffres. */
  code: string
  /** Durée de validité en minutes (défaut : 15). */
  expireMinutes?: number
}

export const verificationSubject = 'Votre code de vérification Lien Parental'

export function verificationEmail(props: VerificationProps): { subject: string; html: string } {
  const expire = props.expireMinutes ?? 15
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const code = escapeHtml((props.code || '').toString())

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Voici votre code de vérification pour finaliser la création de votre compte Lien Parental.
      Saisissez-le dans l'application pour confirmer votre adresse email.
    </p>
    <div style="margin:24px 0;padding:20px;background:${t.colors.pageBg};border:1px solid ${t.colors.border};border-radius:8px;text-align:center;">
      <div style="font-family:${t.font};font-size:32px;letter-spacing:8px;font-weight:700;color:${t.colors.night};">
        ${code}
      </div>
    </div>
    <p style="margin:0 0 12px 0;color:${t.colors.textMuted};font-size:14px;">
      Ce code expire dans ${expire} minutes. Si vous ne le trouvez pas, pensez à vérifier vos spams.
    </p>
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">
      Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email en toute sécurité.
    </p>
  `

  return {
    subject: verificationSubject,
    html: baseLayout({
      preheader: `Votre code : ${code} (valable ${expire} minutes).`,
      title: 'Vérifiez votre adresse email',
      body,
    }),
  }
}
