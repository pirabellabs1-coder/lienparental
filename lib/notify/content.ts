/**
 * Textes des notifications (in-app, push, e-mail). Module PUR : testé par tests/notify.test.ts.
 *
 * Règle de confidentialité : les « faits » ne contiennent jamais le texte d'un message,
 * une description, un lieu, une donnée médicale ni le nom d'un dossier ou d'un document.
 * Push et e-mail : prénom de l'auteur, compteurs, date, lien. Exception décidée par le
 * produit : le TITRE d'un événement du calendrier (partagé ou rappel) est affiché, sauf
 * pour un rendez-vous santé (« Rendez-vous santé de Lina », titre complet in-app seulement).
 *
 * Langue : celle du DESTINATAIRE (preferences.langue, voir server.ts), catalogue messages/{locale}/email.json
 * (clés email.notify.*). Sans locale : français (comportement historique).
 */
import { DEFAULT_TZ } from '@/lib/tz'
import type { NotifyEvent, SecurityChange, Topic } from './events'
import { newLoginEmail } from '@/lib/email/templates/newLogin'
import { welcomeEmail } from '@/lib/email/templates/welcome'
import { testimonyReceivedEmail } from '@/lib/email/templates/testimonyReceived'
import { messageWaitingEmail, sendersLabel } from '@/lib/email/templates/messageWaiting'
import { securityChangeEmail } from '@/lib/email/templates/securityChange'
import { inviteAcceptedEmail } from '@/lib/email/templates/inviteAccepted'
import { folderSharedEmail } from '@/lib/email/templates/folderShared'
import { calendarReminderEmail } from '@/lib/email/templates/calendarReminder'
import { calendarSharedEmail } from '@/lib/email/templates/calendarShared'
import { appOrigin } from '@/lib/email/templates/notificationParts'
import { accountModerationEmail, moderationDate } from '@/lib/email/templates/accountModeration'
import type { ModerationKind, ModerationReason } from '@/lib/admin/ops/moderation'
import { emailT, type EmailT, type Locale } from '@/lib/email/i18n'

export type CalendarAction = 'created' | 'updated' | 'deleted'

export type Facts =
  | { event: 'login_new_device'; appareil: string; systeme: string; dateIso: string }
  | { event: 'security_change'; change: SecurityChange; dateIso: string; newEmailMasked?: string }
  | { event: 'message_received'; actorName: string; conversationId: string }
  | { event: 'message_email'; conversationId: string; unread: number; senders: string[] }
  | { event: 'coparent_invite_accepted'; actorName: string; role: 'parent' | 'proche' }
  | { event: 'vault_folder_shared'; actorName: string; folderId: string }
  | { event: 'testimony_received'; witnessFirstName: string; reference: string }
  | { event: 'calendar_reminder'; eventId: string; titre: string; startAt: string; allDay: boolean; kind?: string; childName?: string | null }
  | { event: 'calendar_shared'; eventId: string; action: CalendarAction; actorName: string; titre: string; startAt: string; allDay: boolean; kind?: string; childName?: string | null }
  | { event: 'coparent_activity'; entity: 'expense' | 'garde'; entityId: string; action: 'created' | 'updated'; actorName: string }
  | { event: 'welcome' }
  | { event: 'account_moderation'; kind: ModerationKind; reasonCode: ModerationReason | null; details: string | null; until: string | null }

export type Rendered = {
  /** Ligne in-app (écran Notifications). */
  title: string
  body: string
  /** Chemin interne /app/… */
  href: string
  push: { title: string; body: string; tag: string }
  /** Absent : pas d'e-mail pour cet événement. */
  email?: { subject: string; html: string }
  /** Thème de préférence (sinon celui de la règle). */
  topic?: Topic
  /** false : e-mail exclu pour ce contenu (ex. événement partagé lointain). */
  emailEligible?: boolean
}

/** Fenêtre d'envoi par e-mail des événements partagés (création, modification, annulation). */
export const SHARED_EVENT_EMAIL_DAYS = 14

const name = (s: string | null | undefined, fallback: string) => (s ?? '').trim() || fallback

/** « le 12 nov. à 10h », « le 12 nov. à 10h30 », « le 12 nov. » (journée entière), fuseau de l'application. */
export function whenLabel(iso: string, allDay = false, locale: Locale = 'fr'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const tr = emailT(locale)
  if (locale === 'en') {
    const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: DEFAULT_TZ }).format(d)
    if (allDay) return tr('notify.whenAllDay', { day })
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: DEFAULT_TZ }).format(d)
    return tr('notify.whenTimed', { day, time })
  }
  const day = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'fr-FR', { day: 'numeric', month: 'short', timeZone: DEFAULT_TZ }).format(d)
  if (allDay) return tr('notify.whenAllDay', { day })
  const parts = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: DEFAULT_TZ }).formatToParts(d)
  const h = String(Number(parts.find(p => p.type === 'hour')?.value ?? '0'))
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return tr('notify.whenTimed', { day, time: `${h}h${m === '00' ? '' : m}` })
}

/** Titre et message d'une alerte de sécurité dans la langue du destinataire. */
export function securityText(change: SecurityChange, locale: Locale = 'fr'): { title: string; message: string } {
  const tr = emailT(locale)
  return { title: tr(`notify.security.${change}.title`), message: tr(`notify.security.${change}.message`) }
}

/** Textes français (historique, conservé pour compatibilité) : préférer securityText(change, locale). */
export const SECURITY_TEXT: Record<SecurityChange, { title: string; message: string }> = {
  password_changed: securityText('password_changed'),
  password_set: securityText('password_set'),
  email_change_requested: securityText('email_change_requested'),
  email_changed: securityText('email_changed'),
  mfa_enabled: securityText('mfa_enabled'),
  mfa_disabled: securityText('mfa_disabled'),
  vault_code_changed: securityText('vault_code_changed'),
  vault_code_removed: securityText('vault_code_removed'),
  account_deletion_requested: securityText('account_deletion_requested'),
}

/**
 * Titre d'événement montré hors de l'application (push, e-mail) : pour un rendez-vous
 * santé, jamais le titre saisi (motif médical possible) mais « Rendez-vous santé de Lina ».
 */
export function publicEventTitle(f: { titre: string; kind?: string; childName?: string | null }, fallback?: string, locale: Locale = 'fr'): string {
  const tr = emailT(locale)
  if (f.kind === 'sante') return f.childName?.trim() ? tr('notify.healthOf', { child: f.childName.trim() }) : tr('notify.health')
  return f.titre.trim() || (fallback ?? tr('notify.anEvent'))
}

function calendarSentence(f: Extract<Facts, { event: 'calendar_shared' }>, outside: boolean, tr: EmailT, locale: Locale): string {
  const who = name(f.actorName, tr('common.aParent'))
  const titre = outside ? publicEventTitle(f, undefined, locale) : (f.titre.trim() || tr('notify.anEvent'))
  const when = whenLabel(f.startAt, f.allDay, locale)
  if (f.action === 'deleted') return tr('notify.calendarDeleted', { who, title: titre, when })
  if (f.action === 'updated') return tr('notify.calendarUpdated', { who, title: titre, when })
  return tr('notify.calendarCreated', { who, title: titre, when })
}

const DEVICE_KEYS = {
  Appareil: 'Appareil',
  Ordinateur: 'Ordinateur',
  'Téléphone Android': 'TelephoneAndroid',
  'Tablette Android': 'TabletteAndroid',
  'Appareil non identifié': 'AppareilNonIdentifie',
  Navigateur: 'Navigateur',
  'Navigateur non identifié': 'NavigateurNonIdentifie',
} as const

/**
 * Libellés d'appareil produits en français par lib/notify/device.ts (« Ordinateur »,
 * « Chrome sur Windows ») → langue du destinataire. Valeur inconnue : inchangée.
 */
export function deviceText(value: string, locale: Locale = 'fr'): string {
  if (locale === 'fr') return value
  const tr = emailT(locale)
  const key = DEVICE_KEYS[value as keyof typeof DEVICE_KEYS]
  if (key) return tr(`device.${key}`)
  const m = /^(.+) sur (.+)$/.exec(value)
  return m ? tr('device.on', { browser: m[1]!, os: m[2]! }) : value
}

/** Contenu d'une notification pour un destinataire (prénom pour la salutation de l'e-mail, langue du destinataire). */
export function renderNotification(f: Facts, recipientPrenom: string, now: Date = new Date(), locale: Locale = 'fr'): Rendered {
  const prenom = recipientPrenom
  const tr = emailT(locale)
  const aParent = tr('common.aParent')
  switch (f.event) {
    case 'login_new_device': {
      const appareil = deviceText(f.appareil, locale)
      const systeme = deviceText(f.systeme, locale)
      const body = tr('notify.loginBody', { device: appareil, system: systeme })
      return {
        title: tr('notify.loginTitle'), body, href: '/app/profil/securite/sessions',
        push: { title: tr('notify.loginTitle'), body: tr('notify.loginPush', { system: systeme }), tag: 'security' },
        email: newLoginEmail({ prenom, appareil, systeme, dateIso: f.dateIso }, locale),
      }
    }
    case 'security_change': {
      const t = securityText(f.change, locale)
      const message = f.change === 'email_change_requested' && f.newEmailMasked
        ? tr('notify.newEmail', { message: t.message, email: f.newEmailMasked })
        : t.message
      return {
        title: t.title, body: tr('notify.ifNotYouSecure'), href: '/app/profil/securite',
        push: { title: t.title, body: tr('notify.ifNotYouOpen'), tag: 'security' },
        email: securityChangeEmail({ prenom, title: t.title, message, dateIso: f.dateIso }, locale),
      }
    }
    case 'message_received': {
      const who = name(f.actorName, aParent)
      return {
        title: tr('notify.wroteYou', { who }), body: tr('notify.messageBody'), href: `/app/messages/${f.conversationId}`,
        push: { title: tr('notify.wroteYou', { who }), body: tr('notify.messagePush'), tag: `conv:${f.conversationId}` },
      }
    }
    case 'message_email': {
      const who = sendersLabel(f.senders, locale)
      return {
        title: tr('notify.wroteYou', { who }), body: tr('notify.unreadBody', { count: f.unread }),
        href: `/app/messages/${f.conversationId}`,
        push: { title: tr('notify.wroteYou', { who }), body: tr('notify.unreadPush'), tag: `conv:${f.conversationId}` },
        email: messageWaitingEmail({ prenom, senders: f.senders, count: f.unread, conversationId: f.conversationId }, locale),
      }
    }
    case 'coparent_invite_accepted': {
      const who = name(f.actorName, tr('inviteAccepted.someone'))
      return {
        title: tr('notify.inviteTitle', { who }), body: tr('notify.inviteBody'), href: '/app/coparents',
        push: { title: tr('notify.inviteTitle', { who }), body: tr('notify.inviteBody'), tag: 'family' },
        email: inviteAcceptedEmail({ prenom, inviteePrenom: f.actorName, role: f.role }, locale),
      }
    }
    case 'vault_folder_shared': {
      const who = name(f.actorName, aParent)
      return {
        title: tr('notify.folderTitle', { who }), body: tr('notify.folderBody'),
        href: `/app/coffre/dossiers/${f.folderId}`,
        push: { title: tr('notify.folderTitle', { who }), body: tr('notify.folderPush'), tag: `folder:${f.folderId}` },
        email: folderSharedEmail({ prenom, ownerPrenom: f.actorName, folderId: f.folderId }, locale),
      }
    }
    case 'testimony_received': {
      return {
        title: tr('notify.testimonyTitle'), body: tr('notify.testimonyBody'), href: '/app/coffre/temoignages/recus',
        push: { title: tr('notify.testimonyTitle'), body: tr('notify.testimonyBody'), tag: 'testimony' },
        email: testimonyReceivedEmail({
          prenom,
          temoinNom: name(f.witnessFirstName, tr('notify.aWitness')),
          titreDemande: tr('notify.testimonyRequest'),
          reference: f.reference || tr('notify.noReference'),
          urlCoffre: `${appOrigin()}/app/coffre/temoignages/recus`,
        }, locale),
      }
    }
    case 'calendar_reminder': {
      const fallback = tr('calendarReminder.defaultTitle')
      const titre = f.titre.trim() || fallback
      const outside = publicEventTitle(f, fallback, locale)
      const when = whenLabel(f.startAt, f.allDay, locale)
      return {
        title: tr('notify.reminderTitle', { title: titre }), body: tr('notify.reminderBody', { when }), href: `/app/calendrier/${f.eventId}`,
        push: { title: tr('notify.reminderTitle', { title: outside }), body: tr('notify.reminderBody', { when }), tag: `event:${f.eventId}` },
        email: calendarReminderEmail({ prenom, titre: outside, whenLabel: when, eventId: f.eventId }, locale),
        topic: 'onCalendrier',
      }
    }
    case 'calendar_shared': {
      const inApp = calendarSentence(f, false, tr, locale)
      const sentence = calendarSentence(f, true, tr, locale)
      const start = Date.parse(f.startAt)
      const soon = Number.isFinite(start)
        && start >= now.getTime() - 86_400_000
        && start <= now.getTime() + SHARED_EVENT_EMAIL_DAYS * 86_400_000
      const href = f.action === 'deleted' ? '/app/calendrier' : `/app/calendrier/${f.eventId}`
      const title = f.action === 'deleted' ? tr('notify.sharedDeleted') : f.action === 'updated' ? tr('notify.sharedUpdated') : tr('notify.sharedCreated')
      return {
        title: inApp, body: title, href,
        push: { title, body: sentence, tag: `event:${f.eventId}` },
        email: calendarSharedEmail({ prenom, sentence, action: f.action, eventId: f.eventId }, locale),
        emailEligible: soon,
      }
    }
    case 'coparent_activity': {
      const who = name(f.actorName, aParent)
      const text = f.entity === 'garde'
        ? tr('notify.gardeUpdated', { who })
        : f.action === 'created' ? tr('notify.expenseCreated', { who }) : tr('notify.expenseUpdated', { who })
      const href = f.entity === 'garde' ? '/app/garde' : `/app/journal/${f.entityId}`
      return {
        title: text, body: f.entity === 'garde' ? tr('notify.gardeBody') : tr('notify.expenseBody'), href,
        push: { title: text, body: tr('notify.activityPush'), tag: `${f.entity}:${f.entityId}` },
        topic: 'onGarde',
      }
    }
    case 'welcome':
      return {
        title: tr('notify.welcomeTitle'), body: tr('notify.welcomeBody'), href: '/app',
        push: { title: tr('notify.welcomeTitle'), body: tr('notify.welcomeBody'), tag: 'welcome' },
        email: welcomeEmail({ prenom }, locale),
      }
    case 'account_moderation': {
      // Les précisions de l'équipe restent dans l'e-mail : la ligne in-app ne reprend que le motif.
      const reason = f.reasonCode ? tr(`moderation.reasons.${f.reasonCode}`) : ''
      const k = f.kind
      const title = k === 'suspension' && f.until
        ? tr('notify.moderation.suspensionTitle', { date: moderationDate(f.until, locale) })
        : tr(`notify.moderation.${k}Title`)
      const body = tr(`notify.moderation.${k}Body`, { reason })
      return {
        title, body, href: '/app/aide',
        push: { title, body, tag: 'moderation' },
        email: accountModerationEmail({ prenom, kind: k, reasonCode: f.reasonCode, details: f.details, until: f.until }, locale),
      }
    }
  }
}

/** Événements dont on a besoin du nom de l'auteur (payload.actor_id). */
export const NEEDS_ACTOR: ReadonlySet<NotifyEvent> = new Set([
  'message_received', 'coparent_invite_accepted', 'vault_folder_shared', 'calendar_shared', 'coparent_activity',
])
