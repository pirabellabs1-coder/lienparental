/**
 * Google Agenda : types et constantes partagés (navigateur ET serveur).
 * Aucun secret ici.
 */

/** Valeurs de l'enum Postgres calendar_event_type (stockées dans google_connections.sync_types). */
export const DB_EVENT_TYPES = [
  'visite', 'appel_video', 'message', 'sante', 'rendez_vous', 'ecole',
  'activite', 'sortie', 'repas', 'deplacement', 'anniversaire', 'autre',
] as const
export type DbEventType = (typeof DB_EVENT_TYPES)[number]

/** Clés d'interface (lib/calendrier EventTypeKey) ↔ valeurs BDD. */
export const UI_EVENT_TYPES = [
  'visite', 'appel', 'message', 'sante', 'rdv', 'ecole',
  'activite', 'sortie', 'repas', 'deplacement', 'anniversaire', 'autre',
] as const
export type UiEventType = (typeof UI_EVENT_TYPES)[number]

export const uiToDbType = (t: UiEventType): DbEventType => (t === 'appel' ? 'appel_video' : t === 'rdv' ? 'rendez_vous' : t)
export const dbToUiType = (t: DbEventType): UiEventType => (t === 'appel_video' ? 'appel' : t === 'rendez_vous' ? 'rdv' : t)

/** Titres génériques utilisés quand les détails sont masqués. */
export const GENERIC_TITLES: Record<DbEventType, string> = {
  visite: 'Visite',
  appel_video: 'Appel vidéo',
  message: 'Message',
  sante: 'Rendez-vous santé',
  rendez_vous: 'Rendez-vous',
  ecole: 'École',
  activite: 'Activité',
  sortie: 'Sortie',
  repas: 'Repas',
  deplacement: 'Déplacement',
  anniversaire: 'Anniversaire',
  autre: 'Événement',
}

export type CalendarTarget = 'dedicated' | 'primary'
/** none : tout afficher ; sensitive : masquer les rendez-vous santé ; all : masquer tous les détails. */
export type MaskMode = 'none' | 'sensitive' | 'all'
export type ConnectionStatus = 'active' | 'reauth_required' | 'disconnected'

/** Réponse de GET /api/integrations/google/calendar. */
export type GoogleCalendarState =
  | { mode: 'demo'; configured: false }
  | { mode: 'live'; configured: false }
  | {
      mode: 'live'
      configured: true
      connection: null | {
        status: ConnectionStatus
        googleEmail: string | null
        target: CalendarTarget
        calendarReady: boolean
        syncTypes: UiEventType[]
        maskMode: MaskMode
        connectedAt: string | null
        lastSyncAt: string | null
        lastErrorCode: string | null
        pending: number
        failed: number
        /** Portées accordées permettant chaque cible (sans reconnexion). */
        canUse: Record<CalendarTarget, boolean>
      }
    }

/** Réponse de POST /api/integrations/google/calendar/sync. */
export type SyncResponse =
  | { status: 'synced' | 'removed' | 'skipped' | 'queued' | 'not_connected' | 'reauth_required' | 'failed' }
  | { status: 'processed'; processed: number; remaining: number; reauthRequired: boolean }
