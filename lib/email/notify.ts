// lib/email/notify.ts — Envois transactionnels prêts à l'emploi (template + sendEmail).
// Côté serveur uniquement. Sans RESEND_API_KEY : no-op journalisé (voir send.ts).
// Langue : celle du destinataire. `locale` fournie par l'appelant, sinon déduite du compte
// associé à l'adresse (preferences.langue), sinon français.
import 'server-only'

import { sendEmail, type SendEmailResult } from './send'
import type { Locale } from './i18n'
import { localeForEmail } from './locale'
import { welcomeEmail, type WelcomeProps } from './templates/welcome'
import { newLoginEmail, type NewLoginProps } from './templates/newLogin'
import { invoiceEmail, type InvoiceProps } from './templates/invoice'
import { subscriptionConfirmedEmail, type SubscriptionConfirmedProps } from './templates/subscriptionConfirmed'
import { paymentFailedEmail, type PaymentFailedProps } from './templates/paymentFailed'
import { subscriptionCanceledEmail, type SubscriptionCanceledProps } from './templates/subscriptionCanceled'

type Envelope = {
  to: string
  /** Clé d'idempotence (ex. `stripe:<event id>:<template>`) pour ne jamais envoyer deux fois. */
  idempotencyKey?: string
  /** Langue du destinataire. Absente : langue du compte de l'adresse `to` (repli : français). */
  locale?: Locale
}

type Render = (locale: Locale) => { subject: string; html: string }

async function deliver(env: Envelope, render: Render): Promise<SendEmailResult> {
  if (!env.to || !env.to.includes('@')) return { ok: false, error: 'invalid_recipient' }
  const locale = env.locale ?? (await localeForEmail(env.to)) ?? 'fr'
  const rendered = render(locale)
  return sendEmail({ to: env.to, subject: rendered.subject, html: rendered.html, idempotencyKey: env.idempotencyKey })
}

/** Bienvenue (à appeler par le flux d'inscription, après vérification de l'e-mail). */
export function sendWelcomeEmail(env: Envelope, props: WelcomeProps) {
  return deliver(env, (l) => welcomeEmail(props, l))
}

/** Alerte « nouvelle connexion » — helper exporté pour le flux d'authentification. */
export function sendNewLoginEmail(env: Envelope, props: NewLoginProps) {
  return deliver(env, (l) => newLoginEmail(props, l))
}

export function sendSubscriptionConfirmedEmail(env: Envelope, props: SubscriptionConfirmedProps) {
  return deliver(env, (l) => subscriptionConfirmedEmail(props, l))
}

/** Reçu de renouvellement (factures suivantes). */
export function sendInvoiceReceiptEmail(env: Envelope, props: InvoiceProps) {
  return deliver(env, (l) => invoiceEmail(props, l))
}

export function sendPaymentFailedEmail(env: Envelope, props: PaymentFailedProps) {
  return deliver(env, (l) => paymentFailedEmail(props, l))
}

export function sendSubscriptionCanceledEmail(env: Envelope, props: SubscriptionCanceledProps) {
  return deliver(env, (l) => subscriptionCanceledEmail(props, l))
}
