/**
 * Textes des notifications (in-app, push, e-mail). Module PUR : testé par tests/notify.test.ts.
 *
 * Règle de confidentialité : les « faits » ne contiennent jamais le texte d'un message,
 * une description, un lieu, une donnée médicale ni le nom d'un dossier ou d'un document.
 * Push et e-mail : prénom de l'auteur, compteurs, date, lien. Exception décidée par le
 * produit : le TITRE d'un événement du calendrier (partagé ou rappel) est affiché, sauf
 * pour un rendez-vous santé (« Rendez-vous santé de Lina », titre complet in-app seulement).
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

const name = (s: string | null | undefined, fallback = 'Un parent') => (s ?? '').trim() || fallback

/** « le 12 nov. à 10h », « le 12 nov. à 10h30 », « le 12 nov. » (journée entière), fuseau de l'application. */
export function whenLabel(iso: string, allDay = false): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: DEFAULT_TZ }).format(d)
  if (allDay) return `le ${day}`
  const parts = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: DEFAULT_TZ }).formatToParts(d)
  const h = String(Number(parts.find(p => p.type === 'hour')?.value ?? '0'))
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `le ${day} à ${h}h${m === '00' ? '' : m}`
}

export const SECURITY_TEXT: Record<SecurityChange, { title: string; message: string }> = {
  password_changed: { title: 'Votre mot de passe a été modifié', message: 'Le mot de passe de votre compte Lien Parental vient d’être modifié.' },
  password_set: { title: 'Un mot de passe a été défini', message: 'Un mot de passe vient d’être défini pour votre compte Lien Parental.' },
  email_change_requested: { title: 'Changement d’adresse e-mail demandé', message: 'Un changement de l’adresse e-mail de votre compte a été demandé.' },
  email_changed: { title: 'Votre adresse e-mail a été modifiée', message: 'L’adresse e-mail de votre compte Lien Parental a été modifiée.' },
  mfa_enabled: { title: 'Double authentification activée', message: 'La double authentification vient d’être activée sur votre compte.' },
  mfa_disabled: { title: 'Double authentification désactivée', message: 'La double authentification vient d’être désactivée sur votre compte.' },
  vault_code_changed: { title: 'Code du coffre-fort modifié', message: 'Le code de votre coffre-fort vient d’être modifié.' },
  vault_code_removed: { title: 'Code du coffre-fort supprimé', message: 'Le code de votre coffre-fort vient d’être supprimé.' },
  account_deletion_requested: {
    title: 'Suppression de votre compte demandée',
    message: 'La suppression de votre compte Lien Parental a été demandée. Vos données seront définitivement effacées dans 30 jours. Contactez le support pour l’annuler.',
  },
}

/**
 * Titre d'événement montré hors de l'application (push, e-mail) : pour un rendez-vous
 * santé, jamais le titre saisi (motif médical possible) mais « Rendez-vous santé de Lina ».
 */
export function publicEventTitle(f: { titre: string; kind?: string; childName?: string | null }, fallback = 'un événement'): string {
  if (f.kind === 'sante') return f.childName?.trim() ? `Rendez-vous santé de ${f.childName.trim()}` : 'Rendez-vous santé'
  return f.titre.trim() || fallback
}

function calendarSentence(f: Extract<Facts, { event: 'calendar_shared' }>, outside: boolean): string {
  const who = name(f.actorName)
  const titre = outside ? publicEventTitle(f) : (f.titre.trim() || 'un événement')
  const when = whenLabel(f.startAt, f.allDay)
  if (f.action === 'deleted') return `${who} a annulé « ${titre} » prévu ${when}`
  if (f.action === 'updated') return `${who} a modifié « ${titre} » : ${when}`
  return `${who} a ajouté « ${titre} » ${when}`
}

/** Contenu d'une notification pour un destinataire (prénom pour la salutation de l'e-mail). */
export function renderNotification(f: Facts, recipientPrenom: string, now: Date = new Date()): Rendered {
  const prenom = recipientPrenom
  switch (f.event) {
    case 'login_new_device': {
      const body = `Connexion depuis ${f.appareil} (${f.systeme}). Si ce n’était pas vous, sécurisez votre compte.`
      return {
        title: 'Nouvelle connexion à votre compte', body, href: '/app/profil/securite/sessions',
        push: { title: 'Nouvelle connexion à votre compte', body: `Depuis ${f.systeme}. Ce n’était pas vous ? Ouvrez l’application.`, tag: 'security' },
        email: newLoginEmail({ prenom, appareil: f.appareil, systeme: f.systeme, dateIso: f.dateIso }),
      }
    }
    case 'security_change': {
      const t = SECURITY_TEXT[f.change]
      const message = f.change === 'email_change_requested' && f.newEmailMasked
        ? `${t.message} Nouvelle adresse : ${f.newEmailMasked}.`
        : t.message
      return {
        title: t.title, body: 'Si ce n’était pas vous, sécurisez votre compte.', href: '/app/profil/securite',
        push: { title: t.title, body: 'Si ce n’était pas vous, ouvrez l’application.', tag: 'security' },
        email: securityChangeEmail({ prenom, title: t.title, message, dateIso: f.dateIso }),
      }
    }
    case 'message_received': {
      const who = name(f.actorName)
      return {
        title: `${who} vous a écrit`, body: 'Nouveau message dans votre messagerie.', href: `/app/messages/${f.conversationId}`,
        push: { title: `${who} vous a écrit`, body: 'Ouvrez pour lire le message.', tag: `conv:${f.conversationId}` },
      }
    }
    case 'message_email': {
      const who = sendersLabel(f.senders)
      return {
        title: `${who} vous a écrit`, body: `${f.unread} message${f.unread > 1 ? 's' : ''} non lu${f.unread > 1 ? 's' : ''}.`,
        href: `/app/messages/${f.conversationId}`,
        push: { title: `${who} vous a écrit`, body: 'Messages non lus.', tag: `conv:${f.conversationId}` },
        email: messageWaitingEmail({ prenom, senders: f.senders, count: f.unread, conversationId: f.conversationId }),
      }
    }
    case 'coparent_invite_accepted': {
      const who = name(f.actorName, 'La personne invitée')
      return {
        title: `${who} a accepté votre invitation`, body: 'Votre espace est désormais partagé.', href: '/app/coparents',
        push: { title: `${who} a accepté votre invitation`, body: 'Votre espace est désormais partagé.', tag: 'family' },
        email: inviteAcceptedEmail({ prenom, inviteePrenom: f.actorName, role: f.role }),
      }
    }
    case 'vault_folder_shared': {
      const who = name(f.actorName)
      return {
        title: `${who} a partagé un dossier avec vous`, body: 'Dossier du coffre-fort, en lecture seule.',
        href: `/app/coffre/dossiers/${f.folderId}`,
        push: { title: `${who} a partagé un dossier avec vous`, body: 'Ouvrez pour le consulter.', tag: `folder:${f.folderId}` },
        email: folderSharedEmail({ prenom, ownerPrenom: f.actorName, folderId: f.folderId }),
      }
    }
    case 'testimony_received': {
      return {
        title: 'Nouveau témoignage reçu', body: 'Un témoignage est arrivé dans votre coffre-fort.', href: '/app/coffre/temoignages/recus',
        push: { title: 'Nouveau témoignage reçu', body: 'Un témoignage est arrivé dans votre coffre-fort.', tag: 'testimony' },
        email: testimonyReceivedEmail({
          prenom,
          temoinNom: name(f.witnessFirstName, 'Un témoin'),
          titreDemande: 'Demande de témoignage',
          reference: f.reference || 'Non renseignée',
          urlCoffre: `${appOrigin()}/app/coffre/temoignages/recus`,
        }),
      }
    }
    case 'calendar_reminder': {
      const titre = f.titre.trim() || 'Événement'
      const outside = publicEventTitle(f, 'Événement')
      const when = whenLabel(f.startAt, f.allDay)
      return {
        title: `Rappel : « ${titre} »`, body: `Prévu ${when}.`, href: `/app/calendrier/${f.eventId}`,
        push: { title: `Rappel : « ${outside} »`, body: `Prévu ${when}.`, tag: `event:${f.eventId}` },
        email: calendarReminderEmail({ prenom, titre: outside, whenLabel: when, eventId: f.eventId }),
        topic: 'onCalendrier',
      }
    }
    case 'calendar_shared': {
      const inApp = calendarSentence(f, false)
      const sentence = calendarSentence(f, true)
      const start = Date.parse(f.startAt)
      const soon = Number.isFinite(start)
        && start >= now.getTime() - 86_400_000
        && start <= now.getTime() + SHARED_EVENT_EMAIL_DAYS * 86_400_000
      const href = f.action === 'deleted' ? '/app/calendrier' : `/app/calendrier/${f.eventId}`
      const title = f.action === 'deleted' ? 'Événement annulé' : f.action === 'updated' ? 'Événement modifié' : 'Nouvel événement partagé'
      return {
        title: inApp, body: title, href,
        push: { title, body: sentence, tag: `event:${f.eventId}` },
        email: calendarSharedEmail({ prenom, sentence, action: f.action, eventId: f.eventId }),
        emailEligible: soon,
      }
    }
    case 'coparent_activity': {
      const who = name(f.actorName)
      const text = f.entity === 'garde'
        ? `${who} a mis à jour son planning de garde`
        : `${who} a ${f.action === 'created' ? 'ajouté' : 'modifié'} une dépense partagée`
      const href = f.entity === 'garde' ? '/app/garde' : `/app/journal/${f.entityId}`
      return {
        title: text, body: f.entity === 'garde' ? 'Planning de garde' : 'Dépenses partagées', href,
        push: { title: text, body: 'Ouvrez pour voir le détail.', tag: `${f.entity}:${f.entityId}` },
        topic: 'onGarde',
      }
    }
    case 'welcome':
      return {
        title: 'Bienvenue sur Lien Parental', body: 'Votre compte est prêt.', href: '/app',
        push: { title: 'Bienvenue sur Lien Parental', body: 'Votre compte est prêt.', tag: 'welcome' },
        email: welcomeEmail({ prenom }),
      }
  }
}

/** Événements dont on a besoin du nom de l'auteur (payload.actor_id). */
export const NEEDS_ACTOR: ReadonlySet<NotifyEvent> = new Set([
  'message_received', 'coparent_invite_accepted', 'vault_folder_shared', 'calendar_shared', 'coparent_activity',
])
