// lib/email/send.ts — Envoi via Resend avec fallback texte brut automatique.

import { Resend } from 'resend'
import { EMAIL_ENABLED } from '@/lib/supabase/config'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  /** Version texte brut. Si omise, générée depuis le HTML. */
  text?: string
  /** From override. Par défaut MAIL_FROM (env). */
  from?: string
  /** Reply-To optionnel. */
  replyTo?: string
  /**
   * Clé d'idempotence Resend (24 h) : un rejeu (webhook Stripe relivré,
   * retry réseau) avec la même clé n'envoie pas un second e-mail.
   */
  idempotencyKey?: string
}

export type SendEmailResult =
  | { ok: true; id: string; skipped?: false }
  /** E-mails désactivés (RESEND_API_KEY absent) : no-op volontaire, pas une erreur. */
  | { ok: true; id: ''; skipped: true }
  | { ok: false; error: string }

/**
 * Redacte une adresse email pour les logs : garde l'initiale de la
 * mailbox et le domaine complet, ex: `martin.dupont@gmail.com`
 * → `m***@gmail.com`. Les valeurs invalides sont remplacées par
 * `[redacted]` pour éviter toute fuite d'un string non-email passé par
 * erreur.
 * TODO : brancher Sentry avec des règles de scrub serveur
 * (beforeSend qui supprime to/subject/body des breadcrumbs).
 */
function redactEmail(to: string | string[]): string {
  const one = (addr: string): string => {
    const at = addr.indexOf('@')
    if (at <= 0 || at === addr.length - 1) return '[redacted]'
    const first = addr[0]
    const domain = addr.slice(at + 1)
    return `${first}***@${domain}`
  }
  return Array.isArray(to) ? to.map(one).join(',') : one(to)
}

let _client: Resend | null = null
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!_client) _client = new Resend(key)
  return _client
}

/**
 * Produit un fallback texte lisible à partir du HTML : supprime scripts/styles,
 * convertit <br> et paragraphes en sauts de ligne, décode quelques entités.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const client = EMAIL_ENABLED ? getClient() : null
  const from = args.from ?? process.env.MAIL_FROM

  if (!client) {
    // Mode sans e-mail (dev / démo) : une ligne de log expurgée, aucun envoi.
    console.info('[email] désactivé (RESEND_API_KEY absent) — non envoyé', { to: redactEmail(args.to) })
    return { ok: true, id: '', skipped: true }
  }
  if (!from) {
    console.warn('[email] MAIL_FROM manquant — email non envoyé', { to: redactEmail(args.to) })
    return { ok: false, error: 'MAIL_FROM manquant' }
  }

  const text = args.text ?? htmlToText(args.html)

  try {
    const res = await client.emails.send(
      {
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text,
        replyTo: args.replyTo,
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey.slice(0, 256) } : undefined,
    )
    if (res.error) {
      // TODO: Sentry.captureException(res.error)
      console.error('[email] erreur Resend', { name: res.error.name, to: redactEmail(args.to) })
      return { ok: false, error: res.error.name || 'resend_error' }
    }
    const id = res.data?.id ?? ''
    // Jamais de subject / body / to en clair : scrub PII par défaut.
    console.info('[email] envoyé', { id, to: redactEmail(args.to) })
    return { ok: true, id }
  } catch (err) {
    // TODO: Sentry.captureException(err)
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[email] exception', msg)
    return { ok: false, error: msg }
  }
}
