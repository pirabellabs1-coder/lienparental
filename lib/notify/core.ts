/**
 * Cœur du dispatcher : décide et livre (in-app, push, e-mail) pour UN destinataire.
 * Module PUR : toutes les entrées/sorties passent par `deps` (Supabase, web-push,
 * Resend en production ; doublures dans tests/notify.test.ts).
 *
 * Garanties :
 *  - ne lève JAMAIS d'exception vers l'appelant (journal expurgé + résultat) ;
 *  - idempotent : clé `dedupeKey` (ligne in-app unique, clé d'idempotence Resend),
 *    et `alreadyDelivered` (un réessai ne renvoie pas un canal déjà livré) ;
 *  - sécurité : préférences ignorées (voir events.ts) ;
 *  - compte supprimé : rien, sauf l'alerte « suppression demandée » (adresse d'origine).
 */
import { decideChannels, isSecurityChange, type Channel, type NotifPrefs, type NotifyEvent } from './events'
import { renderNotification, type Facts } from './content'
import type { Locale } from '@/lib/email/i18n'

export type Recipient = {
  email: string | null
  prenom: string
  deleted: boolean
  prefs: NotifPrefs
  /** Langue du destinataire (preferences.langue) : textes in-app, push et e-mail. Absente : français. */
  locale?: Locale
  /** Fuseau du destinataire (preferences.ui.fuseau, lib/timezones#resolveTz). Absent : DEFAULT_TZ. */
  tz?: string
}

export type PushMessage = { title: string; body: string; url: string; tag: string; lang?: Locale }

export type DispatchDeps = {
  loadRecipient(userId: string): Promise<Recipient | null>
  /** Faits nécessaires au texte. null : notification sans objet (élément supprimé, plus visible…). */
  loadFacts(userId: string, event: NotifyEvent, payload: Record<string, unknown>): Promise<Facts | null>
  insertInApp(row: { userId: string; type: NotifyEvent; title: string; body: string; href: string; dedupeKey: string }): Promise<void>
  /** Renvoie le nombre d'appareils atteints (0 si aucun abonnement). Lève en cas d'échec réessayable. */
  sendPush(userId: string, msg: PushMessage): Promise<number>
  sendEmail(args: { to: string; subject: string; html: string; idempotencyKey: string }): Promise<{ ok: boolean }>
  log?(msg: string, meta?: Record<string, unknown>): void
}

export type DispatchInput = {
  userId: string
  event: NotifyEvent
  payload?: Record<string, unknown>
  dedupeKey: string
  alreadyDelivered?: readonly Channel[]
  now?: Date
}

export type DispatchResult = {
  status: 'ok' | 'partial' | 'skipped' | 'error'
  delivered: Channel[]
  failed: Channel[]
  reason?: string
}

function extraEmail(payload: Record<string, unknown>): string | null {
  const v = payload.notify_email
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !v.endsWith('@deleted.invalid') ? v : null
}

export async function dispatch(deps: DispatchDeps, input: DispatchInput): Promise<DispatchResult> {
  const log = deps.log ?? ((m: string, meta?: Record<string, unknown>) => console.warn(`[notify] ${m}`, meta ?? {}))
  const payload = input.payload ?? {}
  const done = new Set<Channel>(input.alreadyDelivered ?? [])
  const delivered: Channel[] = []
  const failed: Channel[] = []
  try {
    const recipient = await deps.loadRecipient(input.userId)
    if (!recipient) return { status: 'skipped', delivered, failed, reason: 'no_recipient' }

    const deletionAlert = input.event === 'security_change' && payload.change === 'account_deletion_requested'
    if (recipient.deleted && !deletionAlert) return { status: 'skipped', delivered, failed, reason: 'deleted' }
    if (input.event === 'security_change' && !isSecurityChange(payload.change)) {
      return { status: 'skipped', delivered, failed, reason: 'unknown_change' }
    }

    const facts = await deps.loadFacts(input.userId, input.event, payload)
    if (!facts) return { status: 'skipped', delivered, failed, reason: 'gone' }

    const r = renderNotification(facts, recipient.prenom, input.now, recipient.locale ?? 'fr', recipient.tz)
    const channels = decideChannels(input.event, recipient.prefs, { topic: r.topic, emailEligible: r.emailEligible })

    for (const ch of channels) {
      if (done.has(ch)) continue
      try {
        if (ch === 'inapp') {
          await deps.insertInApp({ userId: input.userId, type: input.event, title: r.title, body: r.body, href: r.href, dedupeKey: input.dedupeKey })
        } else if (ch === 'push') {
          await deps.sendPush(input.userId, { title: r.push.title, body: r.push.body, url: r.href, tag: r.push.tag, lang: recipient.locale ?? 'fr' })
        } else if (ch === 'email') {
          if (!r.email) continue
          const targets = new Set<string>()
          if (!recipient.deleted && recipient.email) targets.add(recipient.email.toLowerCase())
          const extra = extraEmail(payload)
          if (extra) targets.add(extra.toLowerCase())
          let allOk = targets.size > 0
          let i = 0
          for (const to of targets) {
            const res = await deps.sendEmail({ to, subject: r.email.subject, html: r.email.html, idempotencyKey: `${input.dedupeKey}:email:${i++}` })
            if (!res.ok) allOk = false
          }
          if (!allOk && targets.size > 0) throw new Error('email_failed')
        }
        delivered.push(ch)
      } catch (e) {
        failed.push(ch)
        log(`canal ${ch} en échec`, { event: input.event, error: e instanceof Error ? e.message.slice(0, 80) : 'unknown' })
      }
    }
    return { status: failed.length ? 'partial' : 'ok', delivered, failed }
  } catch (e) {
    log('échec du dispatcher', { event: input.event, error: e instanceof Error ? e.message.slice(0, 80) : 'unknown' })
    return { status: 'error', delivered, failed, reason: 'exception' }
  }
}
