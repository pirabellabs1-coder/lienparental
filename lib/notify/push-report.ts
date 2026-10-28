/**
 * Règles pures de l'envoi Web Push (lib/notify/push.ts), testées par tests/push-test.test.ts.
 */

/** Bilan d'un envoi : appareils atteints, abonnements expirés supprimés, échecs temporaires. */
export type PushReport = { total: number; sent: number; expired: number; failed: number }

/** Échecs consécutifs au-delà desquels un abonnement est retiré. */
export const MAX_PUSH_FAILURES = 10

/**
 * Que faire d'un abonnement après un échec d'envoi :
 * 404 / 410 (abonnement expiré ou révoqué) ou trop d'échecs consécutifs → suppression ;
 * sinon (service push indisponible, délai…) → compteur d'échecs + réessai plus tard.
 */
export function pushFailureAction(statusCode: number | undefined, failureCount: number): 'delete' | 'retry' {
  if (statusCode === 404 || statusCode === 410) return 'delete'
  return failureCount + 1 >= MAX_PUSH_FAILURES ? 'delete' : 'retry'
}

/** Rien n'a été livré et au moins un échec est temporaire : la tâche doit être réessayée. */
export function pushShouldRetry(r: PushReport): boolean {
  return r.sent === 0 && r.failed > 0
}
