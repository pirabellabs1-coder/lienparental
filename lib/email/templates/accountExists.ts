// lib/email/templates/accountExists.ts — Inscription demandée avec une adresse déjà inscrite (anti-énumération :
// l'écran d'inscription répond la même chose, le titulaire de l'adresse est prévenu ici).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { appOrigin, P } from './notificationParts'

export type AccountExistsProps = { prenom: string }

export const accountExistsSubject = 'Vous avez déjà un compte Lien Parental'

export function accountExistsEmail(props: AccountExistsProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const reset = safeUrl(`${appOrigin()}/mot-de-passe-oublie`, `https://${t.brandDomain}/mot-de-passe-oublie`)
  const login = safeUrl(`${appOrigin()}/onboarding/connexion`, `https://${t.brandDomain}/onboarding/connexion`)
  const body = `
    <p style="${P}">Bonjour${prenom ? ` ${prenom}` : ''},</p>
    <p style="${P}">Quelqu'un (vous, sans doute) a voulu créer un compte Lien Parental avec cette adresse e-mail. Vous avez déjà un compte : il suffit de vous connecter.</p>
    <p style="margin:0;color:${t.colors.textMuted};font-size:14px;">Mot de passe oublié ? <a href="${reset}" style="color:${t.colors.link};">Choisissez-en un nouveau</a>. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien n'a été modifié.</p>
  `
  return {
    subject: accountExistsSubject,
    html: baseLayout({
      preheader: 'Vous avez déjà un compte : connectez-vous.',
      title: 'Vous avez déjà un compte',
      body,
      cta: { label: 'Me connecter', href: login },
    }),
  }
}
