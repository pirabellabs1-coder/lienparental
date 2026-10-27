// lib/email/templates/welcome.ts — Bienvenue après création / vérification du compte.

import { baseLayout } from '../layout'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'

export type WelcomeProps = {
  prenom: string
  /** URL de l'espace (défaut : <APP_URL>/app). */
  url?: string
}

/** Objet en français (historique) ; l'objet traduit est renvoyé par welcomeEmail(props, locale). */
export const welcomeSubject = 'Bienvenue sur Lien Parental'

export function welcomeEmail(props: WelcomeProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const url = safeUrl(props.url ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app`, 'https://lienparental.fr/app')

  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
    <p style="margin:0 0 16px 0;">
      ${tr('welcome.intro1')}
      ${tr('welcome.intro2')}
    </p>
    <ul style="margin:0 0 16px 20px;padding:0;">
      <li style="margin:0 0 6px 0;">${tr('welcome.bullet1')}</li>
      <li style="margin:0 0 6px 0;">${tr('welcome.bullet2')}</li>
      <li style="margin:0;">${tr('welcome.bullet3')}</li>
    </ul>
    <p style="margin:0;">${tr('welcome.closing')}</p>
  `

  return {
    subject: tr('welcome.subject'),
    html: baseLayout({
      locale,
      preheader: tr('welcome.preheader'),
      title: tr('welcome.title'),
      body,
      cta: { label: tr('welcome.cta'), href: url },
    }),
  }
}
