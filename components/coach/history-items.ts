// Conversion des analyses stockées en éléments de liste (pur, utilisable côté serveur).
import type { StoredAnalysis } from '@/lib/ai/analyses'
import { currentTz, dayKeyInTz } from '@/lib/tz'

export type CoachListKind = 'capture' | 'pdf' | 'word' | 'document' | 'message'

export type CoachListItem = {
  id: string
  kind: CoachListKind
  title: string
  dateLabel: string
  /** Date ISO (éléments réels) : le libellé est reformaté au rendu dans la langue de l'utilisateur. */
  createdAt?: string
  responseReady: boolean
  /** true : élément réel (actions via /api/coach/history) ; false : exemple de démonstration. */
  remote: boolean
}

export const KIND_LABELS: Record<CoachListKind, string> = {
  capture: "Capture d'écran",
  pdf: 'Document - PDF',
  word: 'Document - Word',
  document: 'Document - Texte',
  message: 'Message écrit',
}

// Fuseau : celui de l'utilisateur dans le navigateur (lib/tz → currentTz) ; côté serveur,
// libellé de repli (DEFAULT_TZ) reformaté au rendu client (localizedDateLabel).
const dayKey = (d: Date, tz: string) => dayKeyInTz(d, tz)

export function dateLabel(iso: string, now = new Date(), tz: string = currentTz()): string {
  const d = new Date(iso)
  const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const today = dayKey(now, tz)
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), tz)
  const k = dayKey(d, tz)
  if (k === today) return `aujourd’hui à ${hm.format(d)}`
  if (k === yesterday) return `hier à ${hm.format(d)}`
  return `${new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: 'numeric', month: 'long' }).format(d)} à ${hm.format(d)}`
}

/** Libellé de date localisé (fuseau de l'utilisateur), pour le rendu côté client. */
export function localizedDateLabel(
  iso: string,
  intl: string,
  fmt: { today: (time: string) => string; yesterday: (time: string) => string; dateAt: (date: string, time: string) => string },
  now = new Date(),
  tz: string = currentTz(),
): string {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat(intl, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
  const k = dayKey(d, tz)
  if (k === dayKey(now, tz)) return fmt.today(time)
  if (k === dayKey(new Date(now.getTime() - 86_400_000), tz)) return fmt.yesterday(time)
  return fmt.dateAt(new Intl.DateTimeFormat(intl, { timeZone: tz, day: 'numeric', month: 'long' }).format(d), time)
}

export function toListItem(a: StoredAnalysis): CoachListItem {
  return { id: a.id, kind: a.kind, title: a.title, dateLabel: dateLabel(a.createdAt), createdAt: a.createdAt, responseReady: Boolean(a.result), remote: true }
}
