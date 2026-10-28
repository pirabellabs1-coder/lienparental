import type { Child } from '@/lib/mock-data'
import { journalTypeLabels } from '@/lib/mock-data'
import { getEventType, type CalendarEvent } from '@/lib/calendrier'
import { DEPENSE_CATEGORIE_LABELS, fluxOf, formatTotals, modeLabel } from '@/lib/journal-finances'
import { expenseAmount, expenseParties, summarizeExpenses, type DossierExpense, type ExpenseGroup, type ExpenseSummary } from './expenses'
import { dayKeyInTz, fmtDayKey, timeInTz } from '@/lib/tz'
import type { JournalRecord } from '@/lib/data/journal'
import type { VaultDocumentRecord } from '@/lib/data/vault'
import type { AppEvent as PdfEvent, DossierJAFProps } from '@/lib/pdf/schemas'
import { displayName, type Message, type Participant } from '@/lib/messages'
import { inPeriod, type DossierProfile, type DossierSource, type DossierTestimony, type Period } from './data'

export type SectionKey = 'infos' | 'journal' | 'calendrier' | 'documents' | 'temoignages' | 'frais' | 'messages'

export const SECTION_ORDER: SectionKey[] = ['infos', 'journal', 'calendrier', 'documents', 'temoignages', 'frais', 'messages']

export const SECTION_META: Record<SectionKey, { label: string; description: string; unit: string }> = {
  infos: { label: 'Informations', description: 'Parents, enfant concerné, référence du dossier', unit: 'fiche' },
  journal: { label: 'Chronologie du journal', description: 'Événements datés de la période', unit: 'événements' },
  calendrier: { label: 'Calendrier et visites', description: 'Visites, appels et rendez-vous de la période', unit: 'rendez-vous' },
  documents: { label: 'Documents', description: 'Liste des pièces du coffre-fort sélectionnées', unit: 'documents' },
  temoignages: { label: 'Témoignages reçus', description: 'Attestations de vos proches et témoins', unit: 'témoignages' },
  frais: { label: 'Dépenses et pension', description: 'Dépenses que vous avez réglées, sommes reçues, opérations réglées par l’autre parent, totaux par catégorie', unit: 'opérations' },
  messages: { label: "Messages avec l'autre parent", description: 'Échanges horodatés de la période', unit: 'messages' },
}

export {
  expenseAmount, expenseParties, sumRegle, summarizeExpenses,
  type CategoryLine, type DossierExpense, type ExpenseGroup, type ExpenseSummary,
} from './expenses'

export type DossierModel = {
  reference: string
  generatedAt: string
  profile: DossierProfile
  child: Child
  otherParent: Participant | null
  me: Participant | null
  period: Period
  sections: Record<SectionKey, boolean>
  journal: JournalRecord[]
  events: CalendarEvent[]
  documents: VaultDocumentRecord[]
  testimonies: DossierTestimony[]
  expenses: DossierExpense[]
  expenseSummary: ExpenseSummary
  messages: Message[]
}

/** Jour d'un instant dans le fuseau de l'utilisateur (même règle que le Journal et le calendrier). */
const day = (iso: string) => dayKeyInTz(iso)

/** Données filtrées (enfant + période + sélection), sans tenir compte des sections cochées. */
export function filterSource(
  source: DossierSource,
  /** `expenses` : lecture dédiée des dépenses du Journal (lib/data/journal → listJournalExpenses). */
  opts: { childId: string; period: Period; documentIds: string[]; expenses: JournalRecord[] },
) {
  const { childId, period, documentIds, expenses } = opts
  // Les dépenses ont leur propre section (« Dépenses et pension ») : pas de doublon dans la chronologie.
  const journal = source.journal
    .filter((e) => e.type !== 'depense' && e.childIds.includes(childId) && inPeriod(e.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''))
  const events = source.events
    .filter((e) => (e.childrenIds ?? []).includes(childId) && inPeriod(day(e.start), period))
    .sort((a, b) => a.start.localeCompare(b.start))
  const documents = source.documents.filter((d) => documentIds.includes(d.id))
  const fraisList = expenses
    .filter((e): e is DossierExpense => e.type === 'depense' && !!e.depense && e.childIds.includes(childId) && inPeriod(e.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''))
  const messages = (source.conversation?.messages ?? []).filter((m) => inPeriod(day(m.createdAt), period))
  return { journal, events, documents, testimonies: source.testimonies, expenses: fraisList, messages }
}

export function sectionCounts(f: ReturnType<typeof filterSource>): Record<SectionKey, number> {
  return {
    infos: 1,
    journal: f.journal.length,
    calendrier: f.events.length,
    documents: f.documents.length,
    temoignages: f.testimonies.length,
    frais: f.expenses.length,
    messages: f.messages.length,
  }
}

function reference(now: Date): string {
  const r = new Uint8Array(2)
  crypto.getRandomValues(r)
  const hex = Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `JAF-${dayKeyInTz(now).slice(0, 7).replace('-', '')}-${hex}`
}

export function composeDossier(
  source: DossierSource,
  child: Child,
  period: Period,
  sections: Record<SectionKey, boolean>,
  filtered: ReturnType<typeof filterSource>,
  now = new Date(),
): DossierModel {
  return {
    reference: reference(now),
    generatedAt: now.toISOString(),
    profile: source.profile,
    child,
    otherParent: source.conversation?.other ?? null,
    me: source.conversation?.me ?? null,
    period,
    sections,
    journal: sections.journal ? filtered.journal : [],
    events: sections.calendrier ? filtered.events : [],
    documents: sections.documents ? filtered.documents : [],
    testimonies: sections.temoignages ? filtered.testimonies : [],
    expenses: sections.frais ? filtered.expenses : [],
    expenseSummary: summarizeExpenses(sections.frais ? filtered.expenses : []),
    messages: sections.messages ? filtered.messages : [],
  }
}

const NUMERIC = { day: '2-digit', month: '2-digit', year: 'numeric' } as const

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Charge utile conforme à dossierJAFSchema (lib/pdf/schemas.ts) pour POST /api/pdf/dossier-jaf.
 * Le gabarit serveur n'a pas de sections dédiées aux frais, au calendrier et aux messages :
 * ils sont versés dans la chronologie, typés. Renvoie null si le profil est incomplet
 * (e-mail invalide) : la génération passe alors directement par le navigateur.
 */
export function toServerPayload(m: DossierModel): DossierJAFProps | null {
  const email = m.profile.email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !m.profile.prenom || !m.profile.nom) return null
  const na = 'Non renseigné'

  const evenements: PdfEvent[] = ([
    ...m.journal.map((e) => ({
      id: `j-${e.id}`, type: journalTypeLabels[e.type] ?? 'Journal', date: e.date, heure: e.heure, titre: e.title,
      resume: clip(e.description, 600), lieu: e.lieu,
    })),
    ...m.events.map((e) => ({
      id: `c-${e.id}`, type: getEventType(e.type).label, date: day(e.start),
      heure: timeInTz(e.start), titre: e.title,
      resume: clip(e.description, 400), lieu: e.location,
    })),
    ...m.expenses.map((e) => {
      const d = e.depense
      const flux = fluxOf(d)
      const { regle, detail } = expenseAmount(d)
      const type = flux === 'tiers' ? 'Réglé par un tiers' : flux === 'entree' ? (d.categorie === 'pension' ? 'Pension reçue' : 'Somme reçue') : d.categorie === 'pension' ? 'Pension versée' : 'Dépense'
      return {
        id: `f-${e.id}`, type, date: e.date, heure: e.heure,
        titre: `${e.title} : ${regle}${detail ? ` (${detail})` : ''}`,
        resume: [
          expenseParties(d), DEPENSE_CATEGORIE_LABELS[d.categorie], modeLabel(d),
          flux === 'tiers' ? 'hors de mes dépenses' : null,
          d.justificatif || d.autresJustificatifs?.length ? 'justificatif joint' : 'sans justificatif',
        ].filter(Boolean).join(' · '),
      }
    }),
    ...m.messages.slice(-200).map((msg) => ({
      id: `m-${msg.id}`, type: 'Message', date: day(msg.createdAt),
      heure: timeInTz(msg.createdAt),
      titre: `Message de ${msg.senderId === m.me?.id ? displayName(m.profile) : m.otherParent ? displayName(m.otherParent) : "l'autre parent"}`,
      resume: clip(msg.body || (msg.attachment ? `Pièce jointe : ${msg.attachment.name}` : ''), 500),
    })),
  ] as PdfEvent[]).sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''))

  return {
    reference: m.reference,
    generatedAt: m.generatedAt,
    parent: { prenom: m.profile.prenom, nom: m.profile.nom, adresse: na, cp: '-', ville: na, email, tel: na },
    autreParent: m.otherParent && m.otherParent.prenom && m.otherParent.nom ? { prenom: m.otherParent.prenom, nom: m.otherParent.nom } : undefined,
    enfant: { prenom: m.child.prenom, dateNaissance: m.child.dateNaissance, classe: m.child.classe || undefined },
    evenements,
    documents: m.documents.map((d) => ({ nom: d.name, type: d.ext, date: d.docDate })),
    temoignages: m.testimonies.map((t) => ({ reference: t.reference, auteur: t.author, lien: t.relation || 'Non précisé', date: t.date, extrait: clip(t.summary, 600) ?? '' })),
    resume: [
      `Dossier couvrant la période du ${fmtDayKey(m.period.from, NUMERIC)} au ${fmtDayKey(m.period.to, NUMERIC)}.`,
      m.sections.frais ? financeResume(m.expenseSummary) : null,
    ].filter(Boolean).join(' '),
  }
}

/** Totaux financiers pour le résumé du gabarit serveur (qui n'a pas de section dédiée). */
function financeResume(x: ExpenseSummary): string | null {
  const part = (label: string, g: ExpenseGroup) =>
    g.items.length ? `${label} : ${formatTotals(g.totals)}${g.reste.length ? ` (reste dû ${formatTotals(g.reste)})` : ''}` : null
  const parts = [
    part('dépenses réglées par le parent', x.depenses),
    part('sommes reçues', x.recues),
    part("réglé par l'autre parent ou un tiers (hors de ses dépenses)", x.tiers),
  ].filter(Boolean)
  return parts.length ? `Montants déclarés réglés sur la période : ${parts.join(' ; ')}.` : null
}
