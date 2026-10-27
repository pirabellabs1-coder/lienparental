// lib/email/templates/verification.ts — M02 : code à 6 chiffres pour vérifier l'adresse email.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'

export type VerificationProps = {
  prenom: string
  /** Code à 6 chiffres. */
  code: string
  /** Durée de validité en minutes (défaut : 15). */
  expireMinutes?: number
  /** Lien de confirmation (page /auth/confirmer?token_hash=…&type=signup). Facultatif. */
  url?: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par verificationEmail(props, locale). */
export const verificationSubject = 'Votre code de vérification Lien Parental'

export function verificationEmail(props: VerificationProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const expire = props.expireMinutes ?? 60
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const code = escapeHtml((props.code || '').toString())

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('verification.intro1')}
      ${tr('verification.intro2')}
    </p>
    <div style="margin:24px 0;padding:20px;background:${t.colors.pageBg};border:1px solid ${t.colors.border};border-radius:8px;text-align:center;">
      <div style="font-family:${t.font};font-size:32px;letter-spacing:8px;font-weight:700;color:${t.colors.night};">
        ${code}
      </div>
    </div>
    <p style="margin:0 0 12px 0;color:${t.colors.textMuted};font-size:14px;">
      ${tr('verification.expires', { minutes: String(expire) })}
    </p>
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">
      ${tr('verification.ignore')}
    </p>
  `

  return {
    subject: tr('verification.subject'),
    html: baseLayout({
      locale,
      preheader: tr('verification.preheader', { code: String(props.code), minutes: String(expire) }),
      title: tr('verification.title'),
      body,
      ...(props.url ? { cta: { label: tr('verification.cta'), href: safeUrl(props.url) } } : {}),
    }),
  }
}
