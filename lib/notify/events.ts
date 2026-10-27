/**
 * Notifications : matrice des événements et règles de canaux.
 * Module PUR (ni `server-only`, ni Supabase) : testé par tests/notify.test.ts.
 *
 * Règles générales :
 *  - in-app : toujours (historique de l'écran Notifications), sauf e-mails seuls ;
 *  - push   : préférence `notif_push` (appareils où l'utilisateur l'a activé) ET thème ;
 *  - e-mail : préférence `notif_email` ET thème ;
 *  - sécurité (`security: true`) : préférences ignorées, in-app + e-mail toujours ;
 *  - un thème désactivé (preferences.ui.onX = false) coupe push et e-mail, jamais l'in-app.
 */

export const NOTIFY_EVENTS = [
  'login_new_device',
  'security_change',
  'message_received',
  'message_email',
  'coparent_invite_accepted',
  'vault_folder_shared',
  'testimony_received',
  'calendar_reminder',
  'calendar_shared',
  'coparent_activity',
  'welcome',
] as const
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]

export type Channel = 'inapp' | 'push' | 'email'
export const CHANNELS: readonly Channel[] = ['inapp', 'push', 'email']

/** Thèmes de l'écran Préférences > Notifications (preferences.ui). */
export type Topic = 'onMessages' | 'onGarde' | 'onCalendrier' | 'onDocuments'

export type NotifPrefs = {
  push: boolean
  email: boolean
  rappels: boolean
  topics: Record<Topic, boolean>
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  push: true,
  email: true,
  rappels: true,
  topics: { onMessages: true, onGarde: true, onCalendrier: true, onDocuments: true },
}

/** Ligne public.preferences → préférences de notification (clé de thème absente = activé). */
export function prefsFromRow(row: {
  notif_push?: boolean | null
  notif_email?: boolean | null
  notif_rappels?: boolean | null
  ui?: Record<string, unknown> | null
} | null | undefined): NotifPrefs {
  if (!row) return { ...DEFAULT_NOTIF_PREFS, topics: { ...DEFAULT_NOTIF_PREFS.topics } }
  const ui = (row.ui && typeof row.ui === 'object' ? row.ui : {}) as Record<string, unknown>
  const topic = (k: Topic) => ui[k] !== false
  return {
    push: row.notif_push !== false,
    email: row.notif_email !== false,
    rappels: row.notif_rappels !== false,
    topics: { onMessages: topic('onMessages'), onGarde: topic('onGarde'), onCalendrier: topic('onCalendrier'), onDocuments: topic('onDocuments') },
  }
}

type Mode = 'always' | 'pref' | 'never'

export type Rule = {
  /** Alerte de sécurité : préférences ignorées. */
  security?: boolean
  inapp: boolean
  push: Mode
  email: Mode
  /** Thème par défaut (peut être précisé par le contenu, ex. activité garde / calendrier). */
  topic?: Topic
  /** Exige preferences.notif_rappels (sinon rien du tout, in-app compris). */
  needsRappels?: boolean
}

export const RULES: Record<NotifyEvent, Rule> = {
  login_new_device:         { security: true, inapp: true, push: 'always', email: 'always' },
  security_change:          { security: true, inapp: true, push: 'never', email: 'always' },
  message_received:         { inapp: true, push: 'pref', email: 'never', topic: 'onMessages' },
  message_email:            { inapp: false, push: 'never', email: 'pref', topic: 'onMessages' },
  coparent_invite_accepted: { inapp: true, push: 'pref', email: 'pref' },
  vault_folder_shared:      { inapp: true, push: 'pref', email: 'pref', topic: 'onDocuments' },
  testimony_received:       { inapp: true, push: 'pref', email: 'pref', topic: 'onDocuments' },
  calendar_reminder:        { inapp: true, push: 'pref', email: 'pref', needsRappels: true },
  calendar_shared:          { inapp: true, push: 'pref', email: 'pref', topic: 'onCalendrier' },
  coparent_activity:        { inapp: true, push: 'pref', email: 'never', topic: 'onGarde' },
  welcome:                  { inapp: false, push: 'never', email: 'always' },
}

export function isNotifyEvent(v: unknown): v is NotifyEvent {
  return typeof v === 'string' && (NOTIFY_EVENTS as readonly string[]).includes(v)
}

/**
 * Canaux à utiliser pour un événement, selon les préférences du destinataire.
 * `emailEligible: false` : le contenu exclut l'e-mail (ex. événement partagé à plus de 14 jours).
 */
export function decideChannels(
  event: NotifyEvent,
  prefs: NotifPrefs,
  opts: { topic?: Topic; emailEligible?: boolean } = {},
): Channel[] {
  const rule = RULES[event]
  if (rule.security) {
    const out: Channel[] = []
    if (rule.inapp) out.push('inapp')
    if (rule.push === 'always') out.push('push')
    if (rule.email === 'always') out.push('email')
    return out
  }
  if (rule.needsRappels && !prefs.rappels) return []
  const topic = opts.topic ?? rule.topic
  const topicOn = topic ? prefs.topics[topic] : true
  const allowed = (mode: Mode, pref: boolean) => mode === 'always' || (mode === 'pref' && pref && topicOn)

  const out: Channel[] = []
  if (rule.inapp) out.push('inapp')
  if (allowed(rule.push, prefs.push)) out.push('push')
  if (opts.emailEligible !== false && allowed(rule.email, prefs.email)) out.push('email')
  return out
}

export const SECURITY_CHANGES = [
  'password_changed',
  'password_set',
  'email_change_requested',
  'email_changed',
  'mfa_enabled',
  'mfa_disabled',
  'vault_code_changed',
  'vault_code_removed',
  'account_deletion_requested',
] as const
export type SecurityChange = (typeof SECURITY_CHANGES)[number]

export function isSecurityChange(v: unknown): v is SecurityChange {
  return typeof v === 'string' && (SECURITY_CHANGES as readonly string[]).includes(v)
}
