// lib/email/templates/subscriptionCanceled.ts — Résiliation programmée ou effective.

import { baseLayout } from '../layout'
import { emailTheme as t } from '../theme'
import { escapeHtml, safeUrl } from '../escape'
import { emailT, greeting, type Locale } from '../i18n'
import { formatDateFr } from './format'

export type SubscriptionCanceledProps = {
  prenom: string
  /**
   * 'scheduled' : résiliation demandée, Premium actif jusqu'à `endIso`.
   * 'ended' : l'abonnement a pris fin (fin de période ou impayé).
   */
  kind: 'scheduled' | 'ended'
  /** Date ISO de fin des avantages Premium. */
  endIso: string | null
}

export function subscriptionCanceledEmail(props: SubscriptionCanceledProps, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const prenom = escapeHtml(props.prenom?.trim() || '')
  const end = props.endIso ? escapeHtml(formatDateFr(props.endIso, locale)) : ''
  const url = safeUrl(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/profil/abonnement`,
    'https://lienparental.fr/app/profil/abonnement',
  )

  const scheduled = props.kind === 'scheduled'
  const subject = scheduled ? tr('subscriptionCanceled.subjectScheduled') : tr('subscriptionCanceled.subjectEnded')
  const strong = `<strong>${end}</strong>`

  const body = scheduled
    ? `
      <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
      <p style="margin:0 0 16px 0;">
        ${tr('subscriptionCanceled.scheduledIntro')}
      </p>
      <p style="margin:0 0 16px 0;">
        ${end ? tr('subscriptionCanceled.activeUntil', { date: strong }) : tr('subscriptionCanceled.activeUntilPeriodEnd')}
        ${tr('subscriptionCanceled.cancelAnytime')}
      </p>`
    : `
      <p style="margin:0 0 16px 0;">${greeting(tr, prenom)}</p>
      <p style="margin:0 0 16px 0;">
        ${end ? tr('subscriptionCanceled.endedOn', { date: strong }) : tr('subscriptionCanceled.ended')}
      </p>
      <p style="margin:0 0 16px 0;">
        ${tr('subscriptionCanceled.dataKept1')}
        ${tr('subscriptionCanceled.dataKept2')}
      </p>`

  const mail = `<a href="mailto:${t.supportEmail}" style="color:${t.colors.textMuted};">${t.supportEmail}</a>`
  return {
    subject,
    html: baseLayout({
      locale,
      preheader: scheduled
        ? tr('subscriptionCanceled.preheaderScheduled', { date: props.endIso ? formatDateFr(props.endIso, locale) : tr('subscriptionCanceled.periodEnd') })
        : tr('subscriptionCanceled.preheaderEnded'),
      title: scheduled ? tr('subscriptionCanceled.titleScheduled') : tr('subscriptionCanceled.titleEnded'),
      body,
      cta: { label: scheduled ? tr('common.manageSubscription') : tr('subscriptionCanceled.ctaResubscribe'), href: url },
      footer: tr('subscriptionCanceled.footer', { email: mail }),
    }),
  }
}
