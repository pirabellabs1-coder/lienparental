'use client'

/**
 * « Mon dossier » : agrégation des données du parent pour l'export JAF et le
 * partage avocat. Réutilise la couche lib/data (démo ou Supabase selon
 * SUPABASE_ENABLED) ; les témoignages et le profil sont lus ici.
 * Chaque source est chargée indépendamment : une source en échec n'empêche
 * pas la génération (elle est signalée comme indisponible).
 */
import { mockUser, type Child } from '@/lib/mock-data'
import { RECEIVED_TESTIMONIES } from '@/lib/mock-vault'
import type { CalendarEvent } from '@/lib/calendrier'
import { LIVE, db } from '@/lib/data/core'
import { dayKeyInTz, todayKey } from '@/lib/tz'
import { listChildren } from '@/lib/data/children'
import { listJournal, type JournalRecord } from '@/lib/data/journal'
import { listEvents } from '@/lib/data/calendar'
import { listDocuments, type VaultDocumentRecord } from '@/lib/data/vault'
import { listMessages, loadThreadState, type Message, type Participant } from '@/lib/messages'

export type DossierTestimony = {
  id: string
  reference: string
  author: string
  relation: string
  /** yyyy-mm-dd */
  date: string
  summary: string
  facts: string[]
}

export type DossierProfile = { prenom: string; nom: string; email: string }

export type DossierSource = {
  profile: DossierProfile
  children: Child[]
  journal: JournalRecord[]
  events: CalendarEvent[]
  documents: VaultDocumentRecord[]
  testimonies: DossierTestimony[]
  conversation: { me: Participant; other: Participant; messages: Message[] } | null
  /** Sources qui n'ont pas pu être chargées */
  unavailable: string[]
}

async function loadProfile(): Promise<DossierProfile> {
  if (!LIVE) return { prenom: mockUser.prenom, nom: mockUser.nom, email: mockUser.email }
  const { data: { user } } = await db().auth.getUser()
  if (!user) throw new Error('no_session')
  const { data } = await db().from('users').select('prenom, nom, email').eq('id', user.id).maybeSingle()
  const row = data as { prenom: string | null; nom: string | null; email: string | null } | null
  return { prenom: row?.prenom ?? '', nom: row?.nom ?? '', email: row?.email ?? user.email ?? '' }
}

async function loadTestimonies(): Promise<DossierTestimony[]> {
  if (!LIVE) {
    return RECEIVED_TESTIMONIES.map((t, i) => ({
      id: t.id,
      reference: `TMG-${t.receivedAt.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`,
      author: t.author,
      relation: t.relation,
      date: t.receivedAt,
      summary: t.summary,
      facts: t.facts,
    }))
  }
  const { data, error } = await db()
    .from('testimonies')
    .select('id, reference, temoin, texte_envoye, sent_at')
    .order('sent_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; reference: string; temoin: { prenom?: string; nom?: string; lien?: string } | null; texte_envoye: string; sent_at: string }>)
    .map((r) => ({
      id: r.id,
      reference: r.reference,
      author: `${r.temoin?.prenom ?? ''} ${r.temoin?.nom ? r.temoin.nom.charAt(0) + '.' : ''}`.trim() || 'Témoin',
      relation: r.temoin?.lien ?? '',
      date: dayKeyInTz(r.sent_at),
      summary: r.texte_envoye,
      facts: [],
    }))
}

async function loadConversation(): Promise<DossierSource['conversation']> {
  const state = await loadThreadState()
  if (!state.conversationId || !state.other) return null
  const messages = await listMessages(state.conversationId)
  return { me: state.me, other: state.other, messages }
}

export async function loadDossierSource(): Promise<DossierSource> {
  const [profile, children, journal, events, documents, testimonies, conversation] = await Promise.allSettled([
    loadProfile(), listChildren(), listJournal(), listEvents({ expand: false }), listDocuments(), loadTestimonies(), loadConversation(),
  ])
  const unavailable: string[] = []
  const pick = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
    if (r.status === 'fulfilled') return r.value
    unavailable.push(label)
    return fallback
  }
  if (children.status === 'rejected') throw new Error('Impossible de charger vos enfants.')
  return {
    profile: pick(profile, 'profil', { prenom: '', nom: '', email: '' }),
    children: children.value.filter((c) => c.statut !== 'archive'),
    journal: pick(journal, 'journal', []),
    events: pick(events, 'calendrier', []),
    documents: pick(documents, 'documents', []),
    testimonies: pick(testimonies, 'témoignages', []),
    conversation: pick(conversation, 'messages', null),
    unavailable,
  }
}

// --- Période -----------------------------------------------------------------

export type PeriodPreset = '3m' | '6m' | '12m' | 'custom'
export type Period = { from: string; to: string }

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: '3m', label: '3 derniers mois' },
  { value: '6m', label: '6 derniers mois' },
  { value: '12m', label: '12 derniers mois' },
  { value: 'custom', label: 'Personnalisée' },
]

/** Période glissante se terminant aujourd'hui (jours du fuseau de l'utilisateur). */
export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, now = new Date()): Period {
  const months = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
  const to = todayKey(undefined, now)
  const [y, m, d] = to.split('-').map(Number)
  // Même quantième n mois plus tôt, ramené au dernier jour du mois si besoin (31 → 30/28).
  const target = new Date(Date.UTC(y, m - 1 - months, 1, 12))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return { from: dayKeyInTz(target, 'UTC'), to }
}

export const inPeriod = (day: string, p: Period) => day >= p.from && day <= p.to

// --- Sélection partagée entre « Mon dossier » et « Partager » ---------------

export type DossierSelection = {
  childId: string
  preset: PeriodPreset
  period: Period
  documentIds: string[]
  /** Sections cochées sur « Mon dossier », reprises par le partage avocat (absentes : valeurs par défaut). */
  journal?: boolean
  testimonies?: boolean
  messages?: boolean
}

const SELECTION_KEY = 'lp.dossier.selection.v1'

export function saveSelection(sel: DossierSelection) {
  try { window.sessionStorage.setItem(SELECTION_KEY, JSON.stringify(sel)) } catch { /* mémoire seule */ }
}

export function readSelection(): DossierSelection | null {
  try {
    const raw = window.sessionStorage.getItem(SELECTION_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<DossierSelection>
    if (typeof v.childId !== 'string' || !v.period || typeof v.period.from !== 'string' || typeof v.period.to !== 'string') return null
    return {
      childId: v.childId,
      preset: (['3m', '6m', '12m', 'custom'] as const).includes(v.preset as PeriodPreset) ? (v.preset as PeriodPreset) : 'custom',
      period: { from: v.period.from, to: v.period.to },
      documentIds: Array.isArray(v.documentIds) ? v.documentIds.filter((x): x is string => typeof x === 'string') : [],
      ...(typeof v.journal === 'boolean' ? { journal: v.journal } : {}),
      ...(typeof v.testimonies === 'boolean' ? { testimonies: v.testimonies } : {}),
      ...(typeof v.messages === 'boolean' ? { messages: v.messages } : {}),
    }
  } catch {
    return null
  }
}

/** Nom de fichier ASCII sûr : « Dossier-JAF-Lina-2026-10.pdf ». */
export function dossierFilename(childPrenom: string, now = new Date()): string {
  const name = childPrenom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'Enfant'
  return `Dossier-JAF-${name}-${todayKey(undefined, now).slice(0, 7)}.pdf`
}
