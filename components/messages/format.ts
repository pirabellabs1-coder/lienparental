// Formatage des dates de la messagerie. Règle unique de l'application (lib/tz) : un instant
// se lit, se regroupe par jour et s'affiche dans DEFAULT_TZ, jamais dans le fuseau du
// navigateur ni du serveur (même rendu partout, y compris dans les exports PDF).
import { addDaysToKey, dayKeyInTz, fmtDayKey, timeInTz } from '@/lib/tz'

/** « 09:30 » dans DEFAULT_TZ. */
export function timeLabel(iso: string): string {
  return timeInTz(iso)
}

/** Clé de regroupement par jour "yyyy-mm-dd" dans DEFAULT_TZ. */
export function dayKey(iso: string): string {
  return dayKeyInTz(iso)
}

/** « Aujourd'hui », « Hier », « Lundi 20 octobre » (année ajoutée si différente), jours DEFAULT_TZ. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const day = dayKeyInTz(iso)
  const today = dayKeyInTz(now)
  if (day === today) return "Aujourd'hui"
  if (day === addDaysToKey(today, -1)) return 'Hier'
  const s = fmtDayKey(day, {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}),
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Heure si aujourd'hui, « Hier », sinon « 26 oct. » (listes), jours DEFAULT_TZ. */
export function shortStamp(iso: string, now: Date = new Date()): string {
  const day = dayKeyInTz(iso)
  const today = dayKeyInTz(now)
  if (day === today) return timeLabel(iso)
  if (day === addDaysToKey(today, -1)) return 'Hier'
  return fmtDayKey(day, { day: 'numeric', month: 'short' })
}

/** « 26 octobre 2026 à 09:30 » (export, notes de preuve), DEFAULT_TZ. */
export function fullStamp(iso: string): string {
  return `${fmtDayKey(dayKeyInTz(iso), { day: 'numeric', month: 'long', year: 'numeric' })} à ${timeLabel(iso)}`
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} Mo`
}

export function initials(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || '?'
}
