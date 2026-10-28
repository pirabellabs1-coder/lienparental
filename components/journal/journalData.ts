import { mockJournalEntries, mockChildren, type JournalEntry } from '@/lib/mock-data'
import { demoDepenseEntries, type JournalDepense } from '@/lib/journal-finances'
import { dayKeyInTz, dayKeyToDate, isDayKey, timeInTz } from '@/lib/tz'
import { intlLocale } from '@/lib/i18n/config'
import { formatHm } from '@/components/famille/useFamilyFormat'

// Couche d'accès aux entrées du journal pour l'UI (données de démonstration).
// Mode connecté : lib/data/journal (journal_entries + journal_expenses, RLS user_id).

export type JournalImage = { name: string; url?: string; sizeBytes?: number }

export type JournalItem = Omit<JournalEntry, 'images'> & {
  /** HH:mm — fin de l'événement (optionnelle) */
  heureFin?: string
  images: JournalImage[]
  /** HH:mm — heure de création (preuve) */
  createdTime?: string
  /** Champs spécifiques d'une entrée `depense` (Finances dans le Journal). */
  depense?: JournalDepense
}

// Compléments de démonstration (plages horaires, images) pour coller à la maquette.
const EXTRAS: Record<string, Partial<Pick<JournalItem, 'heureFin' | 'images' | 'createdTime'>>> = {
  j_1: {
    heureFin: '19:00',
    createdTime: '19:45',
    images: [
      { name: 'Photo 1.jpg', sizeBytes: 1_258_291 },
      { name: 'Photo 2.jpg', sizeBytes: 1_572_864 },
    ],
  },
  j_2: { heureFin: '19:45', createdTime: '20:02' },
  j_3: { heureFin: '14:45', createdTime: '15:10' },
  j_4: { createdTime: '09:20' },
}

/** Tri du plus récent au plus ancien (date, puis heure). */
export function sortJournal<T extends Pick<JournalItem, 'date' | 'heure'>>(list: T[]): T[] {
  // Comparateur cohérent (0 à égalité) : tri stable, ordre d'origine conservé.
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.heure ?? '').localeCompare(a.heure ?? ''))
}

export function getJournalEntries(): JournalItem[] {
  const base: JournalItem[] = mockJournalEntries.map((e) => ({ ...e, images: e.images ?? [], ...EXTRAS[e.id] }))
  // Dépenses de démo (reprise de l'ancien module « Frais partagés » + exemple du récap v2).
  const depenses: JournalItem[] = demoDepenseEntries().map((e) => ({ ...e, type: 'depense', images: [] }))
  return sortJournal([...base, ...depenses])
}

export function getJournalEntry(id: string): JournalItem | undefined {
  return getJournalEntries().find((e) => e.id === id)
}

export const JOURNAL_CHILDREN = mockChildren.map((c) => ({
  id: c.id,
  label: `${c.prenom} (${c.age} ans)`,
}))

export function childrenNames(ids: string[]): string {
  return JOURNAL_CHILDREN.filter((c) => ids.includes(c.id)).map((c) => c.label).join(', ')
}

// --- Format ---------------------------------------------------------------

/**
 * "yyyy-mm-dd" → Date « jour seul » à midi UTC (lib/tz). Lire avec getUTC*() et formater
 * avec les helpers ci-dessous (`timeZone: 'UTC'`) : aucun glissement selon le fuseau.
 */
export function parseDay(iso: string): Date {
  return dayKeyToDate(iso.slice(0, 10))
}

/**
 * Date et heure de création (preuve) dans le fuseau de l'utilisateur. `createdAt` est un instant ISO
 * (mode connecté) ou, pour certaines données de démo, un jour seul + `createdTime`.
 */
export function createdParts(e: Pick<JournalItem, 'createdAt' | 'createdTime'>): { day: string; time?: string } {
  if (isDayKey(e.createdAt)) return { day: e.createdAt, time: e.createdTime }
  return { day: dayKeyInTz(e.createdAt), time: timeInTz(e.createdAt) || undefined }
}

// Les helpers de format acceptent la locale next-intl (défaut : 'fr', rendu historique).

/** "18:00" → "18h00" (fr) ; "6:00 PM" (en) ; "18:00" (pt) */
export function fmtHeure(hhmm?: string, locale = 'fr'): string {
  if (!hhmm) return ''
  return locale === 'fr' ? hhmm.replace(':', 'h') : formatHm(hhmm, locale)
}

/** "14h30 - 17h30" ou "14h30" */
export function fmtPlage(e: Pick<JournalItem, 'heure' | 'heureFin'>, locale = 'fr'): string {
  if (!e.heure) return ''
  return e.heureFin ? `${fmtHeure(e.heure, locale)} - ${fmtHeure(e.heureFin, locale)}` : fmtHeure(e.heure, locale)
}

// Dates « jour seul » (parseDay) : formatage en UTC, cf. lib/tz.
const UTC = { timeZone: 'UTC' } as const

export function fmtMonthShort(d: Date, locale = 'fr'): string {
  return d.toLocaleDateString(intlLocale(locale), { month: 'short', ...UTC }).replace('.', '').toUpperCase()
}

export function fmtDateFull(d: Date, locale = 'fr'): string {
  const s = d.toLocaleDateString(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...UTC })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function fmtDateMedium(d: Date, locale = 'fr'): string {
  return d.toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', ...UTC })
}

export function fmtMonthYear(d: Date, locale = 'fr'): string {
  const s = d.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric', ...UTC })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** « de mars » / « d’octobre » : élision devant voyelle. */
export function deMonth(label: string): string {
  return /^[aeiouyàâäéèêëîïôöûü]/i.test(label) ? `d’${label}` : `de ${label}`
}

/** 1 258 291 → "1,2 Mo" ; 84 000 → "82 Ko" (en : "1.2 MB", pt : "1,2 MB") */
export function fmtSize(bytes?: number, locale = 'fr'): string {
  if (bytes == null) return ''
  const [mb, kb] = locale === 'fr' ? ['Mo', 'Ko'] : ['MB', 'KB']
  if (bytes >= 1024 * 1024) {
    const v = (bytes / (1024 * 1024)).toFixed(1)
    return `${locale === 'en' ? v : v.replace('.', ',')} ${mb}`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`
}
