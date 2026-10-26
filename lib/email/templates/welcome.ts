// lib/email/templates/welcome.ts — Bienvenue après création / vérification du compte.

import { baseLayout } from '../layout'
import { escapeHtml, safeUrl } from '../escape'

export type WelcomeProps = {
  prenom: string
  /** URL de l'espace (défaut : <APP_URL>/app). */
  url?: string
}

export const welcomeSubject = 'Bienvenue sur Lien Parental'

export function welcomeEmail(props: WelcomeProps): { subject: string; html: string } {
  const prenom = escapeHtml(props.prenom?.trim() || 'bonjour')
  const url = safeUrl(props.url ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app`, 'https://lienparental.fr/app')

  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${prenom},</p>
    <p style="margin:0 0 16px 0;">
      Votre compte Lien Parental est prêt. Vous pouvez dès maintenant tenir votre journal, organiser le calendrier
      de garde et ranger vos documents importants dans votre coffre-fort.
    </p>
    <ul style="margin:0 0 16px 20px;padding:0;">
      <li style="margin:0 0 6px 0;">Notez les échanges et les moments importants, datés et horodatés.</li>
      <li style="margin:0 0 6px 0;">Partagez un calendrier clair avec l'autre parent.</li>
      <li style="margin:0;">Préparez vos courriers et dossiers à partir de modèles.</li>
    </ul>
    <p style="margin:0;">Nous sommes heureux de vous accompagner.</p>
  `

  return {
    subject: welcomeSubject,
    html: baseLayout({
      preheader: 'Votre compte Lien Parental est prêt.',
      title: 'Bienvenue sur Lien Parental',
      body,
      cta: { label: 'Accéder à mon espace', href: url },
    }),
  }
}
