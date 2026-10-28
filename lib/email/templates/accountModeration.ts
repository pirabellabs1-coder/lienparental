// lib/email/templates/accountModeration.ts — Décision de modération sur le compte (avertissement,
// suspension temporaire, désactivation, réactivation). Toujours envoyé (usage du compte).
// Contenu : motif (code traduit + précisions éventuelles de l'équipe), date de fin d'une suspension,
// rappel des règles d'usage, contact de l'assistance. Aucun détail technique (ni ban, ni identifiant).

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { dateLocale, emailT, greeting, type Locale } from '../i18n'
import { appLink, appOrigin, P } from './notificationParts'
import { localePath } from '@/lib/i18n/routing'
import { DEFAULT_TZ } from '@/lib/tz'
import { isModerationReason, type ModerationKind, type ModerationReason } from '@/lib/admin/ops/moderation'

export type AccountModerationProps = {
  prenom: string
  kind: ModerationKind
  /** Code du motif (absent pour une réactivation). */
  reasonCode?: ModerationReason | null
  /** Précisions de l'équipe (texte brut, échappé ici). */
  details?: string | null
  /** Fin de suspension (ISO). */
  until?: string | null
  /** Fuseau du destinataire (preferences.ui.fuseau). Absent : DEFAULT_TZ. */
  tz?: string
}

export function moderationDate(iso: string, locale: Locale, tz: string = DEFAULT_TZ): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'long', timeStyle: 'short', timeZone: tz }).format(d)
}

/** Lien vers les conditions d'utilisation publiques, dans la langue du destinataire. */
export function termsUrl(locale: Locale): string {
  return safeUrl(`${appOrigin()}${localePath(locale, '/legal/cgu')}`, `https://${t.brandDomain}/legal/cgu`)
}

export function accountModerationEmail(props: AccountModerationProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const kind = props.kind
  const reason = isModerationReason(props.reasonCode) ? tr(`moderation.reasons.${props.reasonCode}`) : null
  const details = (props.details ?? '').trim().slice(0, 500)
  const mail = `<a href="mailto:${t.supportEmail}" style="color:${t.colors.link};">${t.supportEmail}</a>`

  const lines: string[] = [
    `<p style="${P}">${greeting(tr, prenom)}</p>`,
    `<p style="${P}">${tr(`moderation.intro.${kind}`)}</p>`,
  ]
  if (kind !== 'reactivation' && reason) {
    lines.push(`<p style="${P}"><strong>${escapeHtml(tr('moderation.reasonLine', { reason }))}</strong></p>`)
  }
  if (kind !== 'reactivation' && details) {
    lines.push(`<p style="${P}white-space:pre-line;">${escapeHtml(tr('moderation.detailsLine', { details }))}</p>`)
  }
  if (kind === 'suspension' && props.until) {
    lines.push(`<p style="${P}">${escapeHtml(tr('moderation.untilLine', { date: moderationDate(props.until, locale, props.tz) }))}</p>`)
  }
  if (kind === 'deactivation') lines.push(`<p style="${P}">${tr('moderation.deactivationLine')}</p>`)
  if (kind === 'suspension' || kind === 'deactivation') lines.push(`<p style="${P}">${tr('moderation.keptData')}</p>`)
  if (kind === 'warning') lines.push(`<p style="${P}">${tr('moderation.warningNext')}</p>`)
  lines.push(`<p style="${P}">${tr(kind === 'reactivation' ? 'moderation.rulesReactivation' : 'moderation.rules')}</p>`)
  lines.push(`<p style="margin:0;color:${t.colors.textMuted};font-size:14px;">${tr('moderation.contact', { email: mail })}</p>`)

  const title = tr(`moderation.title.${kind}`)
  return {
    subject: tr(`moderation.subject.${kind}`),
    html: baseLayout({
      locale,
      preheader: title,
      title,
      body: lines.join('\n'),
      cta: kind === 'reactivation'
        ? { label: tr('moderation.ctaLogin'), href: appLink('/app') }
        : { label: tr('moderation.ctaRules'), href: termsUrl(locale) },
      footer: tr('moderation.footer'),
    }),
  }
}
