// Conversion des analyses stockées en éléments de liste (pur, utilisable côté serveur).
import type { StoredAnalysis } from '@/lib/ai/analyses'

export type CoachListKind = 'capture' | 'pdf' | 'word' | 'document' | 'message'

export type CoachListItem = {
  id: string
  kind: CoachListKind
  title: string
  dateLabel: string
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

const TZ = 'America/Cayenne'
const dayKey = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dm = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long' })

export function dateLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const today = dayKey.format(now)
  const yesterday = dayKey.format(new Date(now.getTime() - 86_400_000))
  const k = dayKey.format(d)
  if (k === today) return `aujourd’hui à ${hm.format(d)}`
  if (k === yesterday) return `hier à ${hm.format(d)}`
  return `${dm.format(d)} à ${hm.format(d)}`
}

export function toListItem(a: StoredAnalysis): CoachListItem {
  return { id: a.id, kind: a.kind, title: a.title, dateLabel: dateLabel(a.createdAt), responseReady: Boolean(a.result), remote: true }
}
