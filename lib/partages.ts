/**
 * Partage temporaire en lecture seule avec l'avocat.
 *
 * Module isomorphe : types partagés, appels client vers /api/partages-avocat,
 * et construction du contenu de démonstration (utilisée côté serveur par
 * /api/partage/[token] quand Supabase n'est pas configuré).
 * La génération du jeton, le hachage du code et la vérification d'accès
 * vivent exclusivement côté serveur (app/api/partage/_lib/server.ts).
 */
import { mockChildren, journalTypeLabels } from '@/lib/mock-data'
import { RECEIVED_TESTIMONIES, VAULT_DOCS } from '@/lib/mock-vault'
import { getJournalEntries } from '@/components/journal/journalData'
import { DEMO_ME, DEMO_ME_ID, DEMO_OTHER, demoSeedMessages } from '@/components/messages/seed'

// --- Types -------------------------------------------------------------------

export type ShareExpiry = '24h' | '7j' | '30j'

export const EXPIRY_OPTIONS: { value: ShareExpiry; label: string; ms: number }[] = [
  { value: '24h', label: '24 heures', ms: 24 * 3_600_000 },
  { value: '7j', label: '7 jours', ms: 7 * 86_400_000 },
  { value: '30j', label: '30 jours', ms: 30 * 86_400_000 },
]

export type ShareScope = {
  childId: string | null
  /** Période du journal (yyyy-mm-dd inclus), null = journal non partagé */
  journal: { from: string; to: string } | null
  documentIds: string[]
  testimonyIds: string[]
  /** Export de la conversation avec l'autre parent (bornée à la période si définie) */
  messages: boolean
}

export type ShareStatus = 'active' | 'expired' | 'revoked'

export type ShareSummary = {
  id: string
  label: string
  /** Chemin relatif « /partage/<jeton> » */
  path: string
  scope: ShareScope
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  hasCode: boolean
  /** Consultations réussies, plus récentes d'abord (10 max) */
  accesses: string[]
  accessCount: number
}

export type CreateShareInput = {
  label: string
  expiry: ShareExpiry
  withCode: boolean
  scope: ShareScope
}

export type CreateShareResult = { share: ShareSummary; code: string | null }

export type SharedEvent = { id: string; date: string; heure?: string; type: string; titre: string; description?: string; lieu?: string }
export type SharedDocument = { id: string; name: string; ext: string; sizeBytes: number; date: string }
export type SharedTestimony = { id: string; author: string; relation: string; date: string; summary: string; facts: string[] }
export type SharedMessage = { id: string; sender: string; fromOwner: boolean; body: string; createdAt: string; attachmentName?: string }

export type ShareContent = {
  label: string
  owner: string
  child: string | null
  createdAt: string
  expiresAt: string
  periode: { from: string; to: string } | null
  timeline: SharedEvent[]
  documents: SharedDocument[]
  testimonies: SharedTestimony[]
  messages: SharedMessage[]
}

export function shareStatus(s: Pick<ShareSummary, 'expiresAt' | 'revokedAt'>, now = Date.now()): ShareStatus {
  if (s.revokedAt) return 'revoked'
  return new Date(s.expiresAt).getTime() <= now ? 'expired' : 'active'
}

export function scopeSummary(scope: ShareScope): string {
  const parts: string[] = []
  if (scope.journal) parts.push('journal')
  if (scope.documentIds.length) parts.push(`${scope.documentIds.length} document${scope.documentIds.length > 1 ? 's' : ''}`)
  if (scope.testimonyIds.length) parts.push(`${scope.testimonyIds.length} témoignage${scope.testimonyIds.length > 1 ? 's' : ''}`)
  if (scope.messages) parts.push('messages')
  return parts.length ? parts.join(', ') : 'aucun contenu'
}

// --- Appels client -------------------------------------------------------------

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message
    throw new Error(msg || (res.status === 401 ? 'Session expirée. Reconnectez-vous.' : 'Une erreur est survenue. Réessayez.'))
  }
  return json as T
}

export async function listShares(): Promise<ShareSummary[]> {
  const { shares } = await api<{ shares: ShareSummary[] }>('/api/partages-avocat')
  return shares
}

export async function createShare(input: CreateShareInput): Promise<CreateShareResult> {
  return api<CreateShareResult>('/api/partages-avocat', { method: 'POST', body: JSON.stringify(input) })
}

export async function revokeShare(id: string): Promise<void> {
  await api<{ ok: true }>(`/api/partages-avocat/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- Contenu de démonstration (serveur) -------------------------------------

function inPeriod(day: string, p: { from: string; to: string } | null): boolean {
  if (!p) return true
  const d = day.slice(0, 10)
  return d >= p.from && d <= p.to
}

const isoDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function buildDemoShareContent(
  scope: ShareScope,
  meta: { label: string; createdAt: string; expiresAt: string; owner: string },
): ShareContent {
  const child = scope.childId ? mockChildren.find((c) => c.id === scope.childId) ?? null : null

  const timeline: SharedEvent[] = scope.journal
    ? getJournalEntries()
        .filter((e) => (!child || e.childIds.includes(child.id)) && inPeriod(e.date, scope.journal))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''))
        .map((e) => ({
          id: e.id, date: e.date, heure: e.heure, type: journalTypeLabels[e.type], titre: e.title,
          description: e.description, lieu: e.lieu,
        }))
    : []

  const documents: SharedDocument[] = VAULT_DOCS
    .filter((d) => scope.documentIds.includes(d.id))
    .map((d) => ({ id: d.id, name: d.name, ext: d.ext, sizeBytes: d.size, date: d.docDate }))

  const testimonies: SharedTestimony[] = RECEIVED_TESTIMONIES
    .filter((t) => scope.testimonyIds.includes(t.id))
    .map((t) => ({ id: t.id, author: t.author, relation: t.relation, date: t.receivedAt, summary: t.summary, facts: t.facts }))

  const messages: SharedMessage[] = scope.messages
    ? demoSeedMessages(new Date(meta.createdAt))
        .filter((m) => inPeriod(isoDay(m.createdAt), scope.journal))
        .map((m) => {
          const mine = m.senderId === DEMO_ME_ID
          const who = mine ? DEMO_ME : DEMO_OTHER
          return {
            id: m.id, sender: `${who.prenom} ${who.nom}`, fromOwner: mine, body: m.body, createdAt: m.createdAt,
            attachmentName: m.attachment?.name,
          }
        })
    : []

  return {
    label: meta.label,
    owner: meta.owner,
    child: child ? `${child.prenom} Martin` : null,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    periode: scope.journal,
    timeline,
    documents,
    testimonies,
    messages,
  }
}
