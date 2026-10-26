'use client'

/**
 * Témoignages — côté parent.
 *
 * - Création d'une demande : POST /api/temoignages (le jeton 32 caractères est généré
 *   CÔTÉ SERVEUR avec crypto.randomBytes ; user_id issu de la session).
 * - Lecture : `testimony_requests` + `testimonies` (RLS user_id = auth.uid()).
 * - Décision du parent (confirmer / refuser) : table `testimony_reviews` (0210) — les
 *   témoignages eux-mêmes restent immuables (valeur probante).
 * - Démo : lib/mock-vault + store sessionStorage (components/coffre/store).
 */
import { z } from 'zod'
import {
  TESTIMONY_LINK_BASE,
  type ReceivedTestimony, type TestimonyRequest, type VaultTone, type Witness,
} from '@/lib/mock-vault'
import { DataError, LIVE, db, requireUserId, toDataError } from './core'
import { dayKeyInTz, timeInTz } from '@/lib/tz'

type RequestRow = {
  id: string
  token: string
  subject: string | null
  temoin_nom_pref: string | null
  message_parent: string | null
  parents: string[] | null
  enfants: string[] | null
  status: 'pending' | 'opened' | 'in_progress' | 'submitted' | 'expired' | 'revoked'
  expires_at: string
  auto_reminder: boolean | null
  deadline: string | null
  revoked_at: string | null
  created_at: string
}

type Temoin = { nom?: string; prenom?: string; lien?: string; duree?: string }

type TestimonyRow = {
  id: string
  request_id: string
  reference: string
  temoin: Temoin | null
  texte_envoye: string
  sent_at: string
}

export type ReceivedTestimonyRecord = ReceivedTestimony & {
  decision?: 'confirme' | 'refuse'
  reference?: string
  fullText?: string
}

const REQ_COLUMNS = 'id, token, subject, temoin_nom_pref, message_parent, parents, enfants, status, expires_at, auto_reminder, deadline, revoked_at, created_at'
const TMG_COLUMNS = 'id, request_id, reference, temoin, texte_envoye, sent_at'

const AVATAR_TONES: VaultTone[] = ['green', 'violet', 'blue', 'orange', 'pink']

/** Lien affiché (sans protocole) — démo : format des maquettes. */
export function testimonyLink(token: string): string {
  if (!LIVE || typeof window === 'undefined') return `${TESTIMONY_LINK_BASE}${token}`
  return `${window.location.host}/temoin/${token}`
}

/** URL complète à partager. */
export function testimonyUrl(token: string): string {
  if (!LIVE || typeof window === 'undefined') return `https://${TESTIMONY_LINK_BASE}${token}`
  return `${window.location.origin}/temoin/${token}`
}

function witnessName(t: Temoin | null): string | undefined {
  const n = [t?.prenom, t?.nom].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
  return n || undefined
}

function isFinished(r: RequestRow, now = Date.now()): boolean {
  return r.revoked_at !== null || r.status === 'submitted' || r.status === 'expired' || r.status === 'revoked' || new Date(r.expires_at).getTime() <= now
}

function pagesOf(text: string) {
  return Math.max(1, Math.ceil(text.length / 2500))
}

async function loadTestimonies(): Promise<TestimonyRow[]> {
  const { data, error } = await db().from('testimonies').select(TMG_COLUMNS).order('sent_at', { ascending: true }).limit(1000)
  if (error) throw toDataError(error, 'testimonies.list')
  return (data ?? []) as TestimonyRow[]
}

export async function listTestimonyRequests(): Promise<TestimonyRequest[]> {
  const [{ data, error }, testimonies] = await Promise.all([
    db().from('testimony_requests').select(REQ_COLUMNS).order('created_at', { ascending: false }).limit(200),
    loadTestimonies(),
  ])
  if (error) throw toDataError(error, 'testimonyRequests.list')
  const byRequest = new Map<string, TestimonyRow[]>()
  for (const t of testimonies) byRequest.set(t.request_id, [...(byRequest.get(t.request_id) ?? []), t])

  return ((data ?? []) as RequestRow[]).map((r) => {
    const created = new Date(r.created_at)
    const invitedAt = dayKeyInTz(created)
    const invitedTime = timeInTz(created)
    const received = byRequest.get(r.id) ?? []
    const finished = isFinished(r)
    const witnesses: Witness[] = received.map((t, i) => {
      const at = new Date(t.sent_at)
      return {
        n: i + 1, name: witnessName(t.temoin), status: 'recu', invitedAt, invitedTime,
        receivedAt: dayKeyInTz(at), receivedTime: timeInTz(at), pages: pagesOf(t.texte_envoye),
      }
    })
    // Un lien actif attend toujours un témoin de plus (le nombre d'invités n'est pas connu).
    if (!finished) witnesses.push({ n: witnesses.length + 1, status: 'envoi', invitedAt, invitedTime })
    const finishedAt = r.revoked_at ?? (finished ? r.expires_at : undefined)
    return {
      id: r.id,
      token: r.token,
      subject: r.subject || r.temoin_nom_pref || 'Témoignage',
      icon: received.length === 0 ? 'users' : finished ? 'check' : 'hourglass',
      tone: finished ? 'green' : 'violet',
      createdAt: invitedAt,
      finishedAt: finishedAt ? dayKeyInTz(new Date(finishedAt)) : undefined,
      status: finished ? 'termine' : 'attente',
      deadline: r.deadline ?? undefined,
      autoReminder: r.auto_reminder ?? true,
      context: r.message_parent ?? undefined,
      parents: r.parents ?? [],
      enfants: r.enfants ?? [],
      witnesses,
    }
  })
}

export async function listReceivedTestimonies(): Promise<ReceivedTestimonyRecord[]> {
  const [testimonies, { data: reviews, error }] = await Promise.all([
    loadTestimonies(),
    db().from('testimony_reviews').select('testimony_id, decision').limit(1000),
  ])
  if (error) throw toDataError(error, 'testimonyReviews.list')
  const decisions = new Map(((reviews ?? []) as { testimony_id: string; decision: 'confirme' | 'refuse' }[]).map((r) => [r.testimony_id, r.decision]))
  const rank = new Map<string, number>()

  return testimonies.map((t) => {
    const n = (rank.get(t.request_id) ?? 0) + 1
    rank.set(t.request_id, n)
    const at = new Date(t.sent_at)
    const author = witnessName(t.temoin) ?? `Témoin ${n}`
    const initials = author.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase() || 'T'
    const blocks = t.texte_envoye.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    const summary = (blocks[0] ?? t.texte_envoye).replace(/\s+/g, ' ').slice(0, 400)
    return {
      id: t.id,
      requestId: t.request_id,
      author,
      initials,
      tone: AVATAR_TONES[(n - 1) % AVATAR_TONES.length],
      receivedAt: dayKeyInTz(at),
      receivedTime: timeInTz(at),
      relation: t.temoin?.lien || 'Non précisé',
      knownSince: t.temoin?.duree || 'Non précisé',
      summary,
      facts: blocks.slice(1, 30).map((b) => b.replace(/\s+/g, ' ')),
      decision: decisions.get(t.id),
      reference: t.reference,
      fullText: t.texte_envoye,
    }
  }).reverse()
}

export async function reviewTestimony(id: string, decision: 'confirme' | 'refuse'): Promise<void> {
  const userId = await requireUserId()
  const { error } = await db()
    .from('testimony_reviews')
    .upsert({ testimony_id: id, user_id: userId, decision, decided_at: new Date().toISOString() }, { onConflict: 'testimony_id' })
  if (error) throw toDataError(error, 'testimonyReviews.upsert')
}

const createSchema = z.object({
  subject: z.string().trim().min(1, 'Indiquez le titre de la demande.').max(90),
  context: z.string().trim().max(600).optional(),
  parents: z.array(z.string().trim().min(1).max(60)).min(1, 'Ajoutez au moins un parent.').max(10),
  enfants: z.array(z.string().trim().min(1).max(60)).min(1, 'Ajoutez au moins un enfant.').max(10),
})
export type CreateTestimonyRequestInput = z.infer<typeof createSchema>

/** Crée une demande via l'API serveur (jeton généré serveur). */
export async function createTestimonyRequest(input: CreateTestimonyRequestInput): Promise<{ id: string; token: string; createdAt: string }> {
  const p = createSchema.safeParse(input)
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? 'Informations invalides.', 'invalid')
  let res: Response
  try {
    res = await fetch('/api/temoignages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.data) })
  } catch (e) {
    throw toDataError(e, 'testimonyRequests.create')
  }
  const body = (await res.json().catch(() => null)) as { id?: string; token?: string; created_at?: string; error?: { message?: string } } | null
  if (!res.ok || !body?.id || !body.token) {
    throw new DataError(body?.error?.message ?? 'La demande n’a pas pu être créée. Réessayez.', `http_${res.status}`)
  }
  return { id: body.id, token: body.token, createdAt: body.created_at ?? new Date().toISOString() }
}

/** Révoque le lien d'une demande (le témoin ne peut plus l'ouvrir). */
export async function revokeTestimonyRequest(id: string): Promise<void> {
  const { error } = await db().from('testimony_requests').update({ revoked_at: new Date().toISOString(), status: 'revoked' }).eq('id', id)
  if (error) throw toDataError(error, 'testimonyRequests.revoke')
}
