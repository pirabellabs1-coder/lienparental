import 'server-only'
/**
 * Support (back-office) : file des tickets (Coparentalité+ en premier, cf. 0380), fiche,
 * changement de statut / priorité et réponses. Toutes les écritures passent par des
 * fonctions SECURITY DEFINER de 0400 qui écrivent l'audit dans la même transaction.
 */
import { z } from 'zod'
import { RepoError, type AdminCtx } from '@/lib/contenus/repo'
import { demoAudit, opsDemo } from './demo'
import { rpc } from './rpc'
import {
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES,
  type TicketDetail, type TicketFilters, type TicketMessage, type TicketPriority, type TicketRow, type TicketStatus,
} from './types'

const PAGE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPEN: readonly TicketStatus[] = ['open', 'in_progress', 'waiting_user']
const RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

const iso = z.string().min(1)
const isoN = iso.nullable().catch(null)

const rowSchema = z.object({
  id: z.string(), subject: z.string(), category: z.enum(TICKET_CATEGORIES).catch('autre'), status: z.enum(TICKET_STATUSES).catch('open'),
  priority: z.enum(TICKET_PRIORITIES).catch('normal'), created_at: iso, updated_at: iso, last_reply_at: isoN,
  last_reply_by: z.enum(['user', 'admin']).nullable().catch(null), user_id: z.string(), user_email: z.string().nullable().catch(null),
  message_count: z.coerce.number().catch(1), total_count: z.coerce.number().catch(0),
})

const messageSchema = z.object({
  id: z.coerce.string().catch(() => crypto.randomUUID()),
  from: z.enum(['user', 'admin']).catch('user'),
  body: z.string().catch(''),
  at: z.string().catch(''),
  author_id: z.string().nullable().optional(),
})

const detailSchema = z.object({
  id: z.string(), subject: z.string(), body: z.string(), category: z.enum(TICKET_CATEGORIES).catch('autre'),
  status: z.enum(TICKET_STATUSES).catch('open'), priority: z.enum(TICKET_PRIORITIES).catch('normal'),
  messages: z.array(messageSchema).catch([]), created_at: iso, updated_at: iso, closed_at: isoN,
  requester: z.object({ id: z.string(), email: z.string().catch(''), prenom: z.string().nullable().catch(null), plan: z.string().catch('free'), deleted: z.boolean().catch(false) }),
}).nullable()

export type TicketPage = { rows: TicketRow[]; total: number; page: number; pages: number }

export async function listTickets(ctx: AdminCtx, f: TicketFilters): Promise<TicketPage> {
  const page = f.page ?? 1
  if (ctx.mode === 'demo') {
    const needle = f.q?.toLowerCase() ?? ''
    const all = opsDemo().tickets
      .filter((t) => !f.statut || (f.statut === 'en_cours' ? OPEN.includes(t.status) : t.status === f.statut))
      .filter((t) => !f.priorite || t.priority === f.priorite)
      .filter((t) => !f.categorie || t.category === f.categorie)
      .filter((t) => !needle || `${t.subject} ${t.requester.email} ${t.id}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const ao = OPEN.includes(a.status) ? 0 : 1
        const bo = OPEN.includes(b.status) ? 0 : 1
        if (ao !== bo) return ao - bo
        if (ao === 0) return RANK[a.priority] - RANK[b.priority] || a.createdAt.localeCompare(b.createdAt)
        return b.updatedAt.localeCompare(a.updatedAt)
      })
    const rows: TicketRow[] = all.slice((page - 1) * PAGE, page * PAGE).map((t) => ({
      id: t.id, subject: t.subject, category: t.category, status: t.status, priority: t.priority, createdAt: t.createdAt,
      updatedAt: t.updatedAt, lastReplyAt: t.lastReplyAt, lastReplyBy: t.lastReplyBy, userId: t.requester.id,
      userEmail: t.requester.email, messageCount: 1 + t.messages.length,
    }))
    return { rows, total: all.length, page, pages: Math.max(1, Math.ceil(all.length / PAGE)) }
  }
  const data = await rpc(ctx, 'admin_list_tickets', {
    p_status: f.statut ?? null, p_priority: f.priorite ?? null, p_category: f.categorie ?? null, p_search: f.q ?? null,
    p_offset: (page - 1) * PAGE, p_limit: PAGE,
  }, z.array(rowSchema))
  const total = data[0]?.total_count ?? 0
  return {
    rows: data.map((t) => ({
      id: t.id, subject: t.subject, category: t.category, status: t.status, priority: t.priority, createdAt: t.created_at,
      updatedAt: t.updated_at, lastReplyAt: t.last_reply_at, lastReplyBy: t.last_reply_by, userId: t.user_id,
      userEmail: t.user_email, messageCount: t.message_count,
    })),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
  }
}

export async function getTicket(ctx: AdminCtx, id: string): Promise<TicketDetail> {
  if (ctx.mode === 'demo') {
    const t = opsDemo().tickets.find((x) => x.id === id)
    if (!t) throw new RepoError('not_found', 'Ticket introuvable.')
    const { lastReplyAt: _a, lastReplyBy: _b, ...detail } = t
    return structuredClone(detail)
  }
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Ticket introuvable.')
  const d = await rpc(ctx, 'admin_get_ticket', { p_id: id }, detailSchema)
  if (!d) throw new RepoError('not_found', 'Ticket introuvable.')
  return {
    id: d.id, subject: d.subject, body: d.body, category: d.category, status: d.status, priority: d.priority,
    messages: d.messages.map((m): TicketMessage => ({ id: m.id, from: m.from, body: m.body, at: m.at, authorId: m.author_id ?? null })),
    createdAt: d.created_at, updatedAt: d.updated_at, closedAt: d.closed_at, requester: d.requester,
  }
}

export const ticketPatchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
}).refine((v) => v.status || v.priority, 'Rien à modifier.')

export async function updateTicket(ctx: AdminCtx, id: string, patch: z.infer<typeof ticketPatchSchema>): Promise<{ status: TicketStatus; priority: TicketPriority }> {
  if (ctx.mode === 'demo') {
    const t = opsDemo().tickets.find((x) => x.id === id)
    if (!t) throw new RepoError('not_found', 'Ticket introuvable.')
    const before = { status: t.status, priority: t.priority }
    t.status = patch.status ?? t.status
    t.priority = patch.priority ?? t.priority
    t.closedAt = t.status === 'resolved' || t.status === 'closed' ? t.closedAt ?? new Date().toISOString() : null
    t.updatedAt = new Date().toISOString()
    demoAudit('admin.support.update', { subjectId: t.requester.id, entity: 'support_tickets', entityId: id, metadata: { status: [before.status, t.status], priority: [before.priority, t.priority] } })
    return { status: t.status, priority: t.priority }
  }
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Ticket introuvable.')
  return rpc(ctx, 'admin_update_ticket', { p_id: id, p_status: patch.status ?? null, p_priority: patch.priority ?? null },
    z.object({ status: z.enum(TICKET_STATUSES), priority: z.enum(TICKET_PRIORITIES) }))
}

export const replySchema = z.object({
  body: z.string().trim().min(1, 'Rédigez une réponse.').max(8000, '8000 caractères au maximum.'),
  resolve: z.boolean().default(false),
})

export async function replyTicket(ctx: AdminCtx, id: string, input: z.infer<typeof replySchema>): Promise<TicketMessage> {
  if (ctx.mode === 'demo') {
    const t = opsDemo().tickets.find((x) => x.id === id)
    if (!t) throw new RepoError('not_found', 'Ticket introuvable.')
    const m: TicketMessage = { id: crypto.randomUUID(), from: 'admin', body: input.body, at: new Date().toISOString() }
    t.messages.push(m)
    t.status = input.resolve ? 'resolved' : 'waiting_user'
    t.closedAt = input.resolve ? m.at : null
    t.updatedAt = m.at
    t.lastReplyAt = m.at
    t.lastReplyBy = 'admin'
    demoAudit('admin.support.reply', { subjectId: t.requester.id, entity: 'support_tickets', entityId: id, metadata: { length: input.body.length, resolved: input.resolve } })
    return m
  }
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Ticket introuvable.')
  const m = await rpc(ctx, 'admin_reply_ticket', { p_id: id, p_body: input.body, p_resolve: input.resolve }, messageSchema)
  return { id: m.id, from: m.from, body: m.body, at: m.at, authorId: m.author_id ?? null }
}
