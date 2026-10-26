/**
 * Point d'accroche navigateur : après une écriture d'événement réussie,
 * demande au serveur de répercuter le changement dans Google Agenda.
 *
 * - Fire-and-forget : n'échoue jamais, ne retarde jamais l'interface.
 * - `keepalive` : la requête survit à une navigation immédiate.
 * - Le serveur relit l'événement en base : seul l'identifiant est envoyé.
 * - Si aucun agenda n'est relié, on s'abstient pendant 10 minutes (une seule
 *   requête inutile au lieu d'une par écriture). L'écran de paramètres efface
 *   ce marqueur dès qu'une connexion est établie.
 */
const SYNC_URL = '/api/integrations/google/calendar/sync'
const OFF_KEY = 'lp_gcal_off_until'
const OFF_MS = 10 * 60_000

function isOff(): boolean {
  try {
    return Number(sessionStorage.getItem(OFF_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

export function resetGoogleSyncHint(): void {
  try { sessionStorage.removeItem(OFF_KEY) } catch { /* stockage indisponible */ }
}

export function pushCalendarSync(eventId: string, op: 'upsert' | 'delete'): void {
  if (typeof window === 'undefined' || isOff()) return
  void fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, op }),
    credentials: 'same-origin',
    keepalive: true,
  })
    .then(async (res) => {
      if (!res.ok) return
      const body = (await res.json().catch(() => null)) as { status?: string } | null
      if (body?.status === 'not_connected') {
        try { sessionStorage.setItem(OFF_KEY, String(Date.now() + OFF_MS)) } catch { /* ignore */ }
      }
    })
    .catch(() => undefined)
}
