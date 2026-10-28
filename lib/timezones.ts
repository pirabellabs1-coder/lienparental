/**
 * Préférence « Fuseau horaire » (preferences.ui.fuseau) : valeurs proposées, validation,
 * résolution. Module PUR (client et serveur), sans dépendance hors lib/tz.
 *
 * Valeurs stockées :
 *   - absente / ""      : jamais choisie → à l'ouverture de l'app, le fuseau de l'appareil
 *                          est adopté et enregistré (components/tz/TimeZoneProvider) ;
 *   - "auto"            : suivre l'appareil. Le dernier fuseau vu est mémorisé dans
 *                          preferences.ui.fuseauAppareil (rappels, e-mails, Google Agenda) ;
 *   - nom IANA          : fuseau fixe (« Europe/Paris »).
 * Repli partout : DEFAULT_TZ (America/Cayenne).
 */
import { DEFAULT_TZ, isValidTz } from './tz'

export const TZ_AUTO = 'auto'

/** Cookie miroir de la préférence (mode démo sans base, premier rendu serveur). */
export const TZ_COOKIE = 'lp_tz'

/** Fuseaux proposés dans Préférences > Général (libellés : shared.timezones.<key>). */
export const TIMEZONE_CHOICES = [
  { value: 'America/Cayenne', key: 'cayenne' },
  { value: 'Europe/Paris', key: 'paris' },
  { value: 'America/Guadeloupe', key: 'guadeloupe' },
  { value: 'America/Martinique', key: 'martinique' },
  { value: 'Indian/Reunion', key: 'reunion' },
  { value: 'Indian/Mayotte', key: 'mayotte' },
  { value: 'Pacific/Noumea', key: 'noumea' },
  { value: 'Pacific/Tahiti', key: 'papeete' },
  { value: 'America/Miquelon', key: 'miquelon' },
  { value: 'Europe/Brussels', key: 'brussels' },
  { value: 'Europe/Zurich', key: 'zurich' },
  { value: 'Europe/Luxembourg', key: 'luxembourg' },
  { value: 'Europe/London', key: 'london' },
  { value: 'Europe/Lisbon', key: 'lisbon' },
  { value: 'America/Toronto', key: 'montreal' },
  { value: 'America/Sao_Paulo', key: 'saoPaulo' },
  { value: 'America/Belem', key: 'belem' },
  { value: 'America/Paramaribo', key: 'paramaribo' },
  { value: 'America/Guyana', key: 'georgetown' },
  { value: 'America/Port-au-Prince', key: 'portAuPrince' },
  { value: 'Africa/Dakar', key: 'dakar' },
  { value: 'Africa/Abidjan', key: 'abidjan' },
] as const

const CHOICE_VALUES: ReadonlySet<string> = new Set(TIMEZONE_CHOICES.map(c => c.value))

let supported: Set<string> | null = null
function supportedZones(): Set<string> | null {
  if (supported) return supported
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone')
    if (list?.length) supported = new Set([...list, 'UTC', 'Etc/UTC'])
  } catch { /* moteur ancien : contrôle Intl seul */ }
  return supported
}

/**
 * Fuseau IANA accepté en préférence : liste proposée, ou fuseau du moteur Intl
 * (`Intl.supportedValuesOf('timeZone')`, alias canonisés : America/Montreal → America/Toronto).
 */
export function isAllowedTz(v: unknown): v is string {
  if (!isValidTz(v)) return false
  if (CHOICE_VALUES.has(v)) return true
  const zones = supportedZones()
  if (!zones) return true
  if (zones.has(v)) return true
  try {
    return zones.has(new Intl.DateTimeFormat('en-US', { timeZone: v }).resolvedOptions().timeZone)
  } catch {
    return false
  }
}

/** Valeur de préférence valide : "auto" ou fuseau accepté. */
export function isTzPreference(v: unknown): v is string {
  return v === TZ_AUTO || isAllowedTz(v)
}

/** Préférence brute lue en base ou en cookie → valeur valide, ou null (jamais choisie / invalide). */
export function normalizeTzPreference(v: unknown): string | null {
  return isTzPreference(v) ? v : null
}

/**
 * Fuseau effectif d'un utilisateur quand on ne dispose pas de son navigateur
 * (serveur, cron, e-mails, notifications, Google Agenda).
 */
export function resolveTz(ui: { fuseau?: unknown; fuseauAppareil?: unknown } | null | undefined): string {
  const pref = ui?.fuseau
  if (pref === TZ_AUTO) return isAllowedTz(ui?.fuseauAppareil) ? (ui!.fuseauAppareil as string) : DEFAULT_TZ
  return isAllowedTz(pref) ? pref : isAllowedTz(ui?.fuseauAppareil) ? (ui!.fuseauAppareil as string) : DEFAULT_TZ
}

/** Fuseau d'une ligne public.preferences (colonne jsonb `ui`). */
export function tzFromPreferencesRow(row: { ui?: unknown } | null | undefined): string {
  const ui = row?.ui && typeof row.ui === 'object' ? (row.ui as Record<string, unknown>) : null
  return resolveTz(ui)
}

/** Décalage affiché « UTC+01:00 » / « UTC−03:00 » de `tz` à l'instant `at`. */
export function utcOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? ''
    // « GMT+01:00 », « GMT-03:00 », « GMT » (UTC).
    const m = /GMT([+-]\d{2}:\d{2})?/.exec(name)
    if (!m) return 'UTC'
    return m[1] ? `UTC${m[1].replace('-', '−')}` : 'UTC+00:00'
  } catch {
    return ''
  }
}

/** Clé de libellé d'un fuseau proposé, ou null (fuseau hors liste : afficher son nom IANA). */
export function tzChoiceKey(tz: string): string | null {
  return TIMEZONE_CHOICES.find(c => c.value === tz)?.key ?? null
}
