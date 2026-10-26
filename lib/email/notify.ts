// lib/email/notify.ts — Envois transactionnels prêts à l'emploi (template + sendEmail).
// Côté serveur uniquement. Sans RESEND_API_KEY : no-op journalisé (voir send.ts).
import 'server-only'

import { sendEmail, type SendEmailResult } from './send'
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
}

async function deliver(env: Envelope, rendered: { subject: string; html: string }): Promise<SendEmailResult> {
  if (!env.to || !env.to.includes('@')) return { ok: false, error: 'invalid_recipient' }
  return sendEmail({ to: env.to, subject: rendered.subject, html: rendered.html, idempotencyKey: env.idempotencyKey })
}

/** Bienvenue (à appeler par le flux d'inscription, après vérification de l'e-mail). */
export function sendWelcomeEmail(env: Envelope, props: WelcomeProps) {
  return deliver(env, welcomeEmail(props))
}

/** Alerte « nouvelle connexion » — helper exporté pour le flux d'authentification. */
export function sendNewLoginEmail(env: Envelope, props: NewLoginProps) {
  return deliver(env, newLoginEmail(props))
}

export function sendSubscriptionConfirmedEmail(env: Envelope, props: SubscriptionConfirmedProps) {
  return deliver(env, subscriptionConfirmedEmail(props))
}

/** Reçu de renouvellement (factures suivantes). */
export function sendInvoiceReceiptEmail(env: Envelope, props: InvoiceProps) {
  return deliver(env, invoiceEmail(props))
}

export function sendPaymentFailedEmail(env: Envelope, props: PaymentFailedProps) {
  return deliver(env, paymentFailedEmail(props))
}

export function sendSubscriptionCanceledEmail(env: Envelope, props: SubscriptionCanceledProps) {
  return deliver(env, subscriptionCanceledEmail(props))
}
