// lib/email/templates/notificationParts.ts — Briques communes des e-mails de notification (0440).

import { emailTheme as t } from '../theme'
import { safeUrl } from '../escape'

/** Origine de l'application (NEXT_PUBLIC_APP_URL), repli sur le domaine de production. */
export function appOrigin(): string {
  try {
    if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL).origin
  } catch { /* valeur invalide : repli */ }
  return `https://${t.brandDomain}`
}

/** Lien absolu vers un chemin interne /app/…, validé et échappé pour un attribut href. */
export function appLink(path: string): string {
  const p = path.startsWith('/app') && !path.includes('//') ? path : '/app'
  return safeUrl(`${appOrigin()}${p}`, `https://${t.brandDomain}/app`)
}

/** Pied de carte : lien vers les préférences de notification. */
export function preferencesFooter(extra = ''): string {
  const href = appLink('/app/profil/preferences/notifications')
  return `${extra ? `${extra} ` : ''}Vous pouvez choisir les notifications reçues dans <a href="${href}" style="color:${t.colors.link};">vos préférences</a>.`
}

export const P = 'margin:0 0 16px 0;'
