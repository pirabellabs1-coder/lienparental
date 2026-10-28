/**
 * « Envoyer une notification de test » (Préférences > Notifications, route POST /api/push/test).
 * Module PUR (ni `server-only`, ni Supabase) : testé par tests/push-test.test.ts.
 *
 * Envoie une notification push à TOUS les appareils de l'utilisateur et dépose une ligne
 * in-app, puis résume le résultat pour l'écran. Les préférences (notif_push, thèmes) sont
 * volontairement ignorées : l'utilisateur demande lui-même la vérification.
 */
import type { PushReport } from './push-report'

export type PushTestStatus = 'sent' | 'no_devices' | 'expired' | 'failed' | 'not_configured'

export type PushTestOutcome = {
  status: PushTestStatus
  /** Appareils atteints. */
  sent: number
  /** Abonnements expirés (404 / 410), supprimés côté serveur. */
  expired: number
  /** Échecs temporaires (service push indisponible…). */
  failed: number
  /** Ligne ajoutée à l'écran Notifications. */
  inApp: boolean
}

export type PushTestTexts = { title: string; body: string; href: string; lang?: 'fr' | 'en' | 'pt' }

export type PushTestDeps = {
  sendPush(msg: { title: string; body: string; url: string; tag: string; lang?: 'fr' | 'en' | 'pt' }): Promise<PushReport & { configured: boolean }>
  insertInApp(row: { title: string; body: string; href: string; dedupeKey: string }): Promise<void>
}

export const PUSH_TEST_TAG = 'push-test'
export const PUSH_TEST_HREF = '/app/profil/preferences/notifications'
/** Limite de débit : 3 essais par tranche de 10 minutes et par utilisateur. */
export const PUSH_TEST_LIMIT = 3
export const PUSH_TEST_WINDOW_MS = 10 * 60_000

/** Statut à afficher d'après le bilan d'envoi. */
export function pushTestStatus(r: PushReport & { configured: boolean }): PushTestStatus {
  if (!r.configured) return 'not_configured'
  if (r.sent > 0) return 'sent'
  if (r.total === 0) return 'no_devices'
  if (r.expired > 0 && r.failed === 0) return 'expired'
  return 'failed'
}

export async function runPushTest(deps: PushTestDeps, userId: string, texts: PushTestTexts, now: Date = new Date()): Promise<PushTestOutcome> {
  let inApp = false
  try {
    // Clé unique par essai (la limite de débit borne le nombre de lignes).
    await deps.insertInApp({ title: texts.title, body: texts.body, href: texts.href, dedupeKey: `push_test:${userId}:${now.getTime()}` })
    inApp = true
  } catch {
    inApp = false
  }
  try {
    const r = await deps.sendPush({ title: texts.title, body: texts.body, url: texts.href, tag: PUSH_TEST_TAG, lang: texts.lang })
    return { status: pushTestStatus(r), sent: r.sent, expired: r.expired, failed: r.failed, inApp }
  } catch {
    return { status: 'failed', sent: 0, expired: 0, failed: 0, inApp }
  }
}

/** Clé de traduction (account.push.test.result.*) et valeurs pour le message affiché. */
export function pushTestMessage(o: Pick<PushTestOutcome, 'status' | 'sent' | 'expired'>, thisDeviceOn: boolean): { key: string; values: Record<string, number> } {
  switch (o.status) {
    case 'sent':
      return { key: thisDeviceOn ? 'result.sent' : 'result.sentOthers', values: { count: o.sent } }
    case 'no_devices':
      return { key: 'result.noDevices', values: {} }
    case 'expired':
      return { key: 'result.expired', values: { count: o.expired } }
    case 'not_configured':
      return { key: 'result.notConfigured', values: {} }
    default:
      return { key: 'result.failed', values: {} }
  }
}
