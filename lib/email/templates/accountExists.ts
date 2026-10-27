// lib/email/templates/accountExists.ts — Inscription demandée avec une adresse déjà inscrite (anti-énumération :
// l'écran d'inscription répond la même chose, le titulaire de l'adresse est prévenu ici).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { appOrigin, P } from './notificationParts'

export type AccountExistsProps = { prenom: string }

/** Objet en français (historique) ; l'objet traduit est renvoyé par accountExistsEmail(props, locale). */
export const accountExistsSubject = 'Vous avez déjà un compte Lien Parental'

export function accountExistsEmail(props: AccountExistsProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const reset = safeUrl(`${appOrigin()}/mot-de-passe-oublie`, `https://${t.brandDomain}/mot-de-passe-oublie`)
  const login = safeUrl(`${appOrigin()}/onboarding/connexion`, `https://${t.brandDomain}/onboarding/connexion`)
  const link = `<a href="${reset}" style="color:${t.colors.link};">${tr('accountExists.forgotLink')}</a>`
  const body = `
    <p style="${P}">${greeting(tr, prenom)}</p>
    <p style="${P}">${tr('accountExists.intro')}</p>
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">${tr('accountExists.forgot', { link })}</p>
  `
  return {
    subject: tr('accountExists.subject'),
    html: baseLayout({
      locale,
      preheader: tr('accountExists.preheader'),
      title: tr('accountExists.title'),
      body,
      cta: { label: tr('accountExists.cta'), href: login },
    }),
  }
}
