import 'server-only'
/**
 * Modération des témoignages PAR MÉTADONNÉES : statuts, dates, signalements (tickets
 * « abus »), révocation d'un lien encore ouvert. Jamais le contenu, les questions, le
 * message du parent, le nom du témoin ni le jeton (la politique de confidentialité ne
 * prévoit aucune lecture de ces contenus par l'équipe).
 */
import { z } from 'zod'
import { RepoError, type AdminCtx } from '@/lib/contenus/repo'
import { demoAudit, opsDemo } from './demo'
import { rpc } from './rpc'
import {
  TESTIMONY_STATUSES, decodeCursor, encodeCursor,
  type RevokeReason, type TestimonyFilters, type TestimonyOverview, type TestimonyRequestRow,
} from './types'

const PAGE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isoN = z.string().nullable().catch(null)

const overviewSchema = z.object({
  by_status: z.record(z.coerce.number()).catch({}),
  requests_30d: z.coerce.number().catch(0),
  submitted_30d: z.coerce.number().catch(0),
  reports_open: z.coerce.number().catch(0),
})

const rowSchema = z.object({
  id: z.string(), user_id: z.string(), status: z.enum(TESTIMONY_STATUSES).catch('pending'), created_at: z.string(), expires_at: z.string(),
  opened_at: isoN, submitted_at: isoN, revoked_at: isoN, has_testimony: z.boolean().catch(false),
})

export async function testimonyOverview(ctx: AdminCtx): Promise<TestimonyOverview> {
  if (ctx.mode === 'demo') {
    const s = opsDemo()
    const byStatus: TestimonyOverview['byStatus'] = {}
    for (const r of s.testimonies) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    const since = Date.now() - 30 * 86_400_000
    return {
      byStatus,
      requests30d: s.testimonies.filter((r) => Date.parse(r.createdAt) >= since).length,
      submitted30d: s.testimonies.filter((r) => r.submittedAt && Date.parse(r.submittedAt) >= since).length,
      reportsOpen: s.tickets.filter((t) => t.category === 'abus' && ['open', 'in_progress', 'waiting_user'].includes(t.status)).length,
    }
  }
  const o = await rpc(ctx, 'admin_testimony_overview', {}, overviewSchema)
  return { byStatus: o.by_status, requests30d: o.requests_30d, submitted30d: o.submitted_30d, reportsOpen: o.reports_open }
}

export type TestimonyPage = { rows: TestimonyRequestRow[]; nextCursor: string | null }

export async function listTestimonyRequests(ctx: AdminCtx, f: TestimonyFilters): Promise<TestimonyPage> {
  const cursor = decodeCursor(f.apres)
  let rows: TestimonyRequestRow[]
  if (ctx.mode === 'demo') {
    rows = opsDemo().testimonies
      .filter((r) => !f.statut || r.status === f.statut)
      .filter((r) => !f.compte || r.userId === f.compte)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .filter((r) => !cursor || r.createdAt < cursor.createdAt || (r.createdAt === cursor.createdAt && r.id < cursor.id))
      .slice(0, PAGE + 1)
  } else {
    const data = await rpc(ctx, 'admin_list_testimony_requests', {
      p_status: f.statut ?? null, p_user: f.compte ?? null,
      p_cursor_created: cursor?.createdAt ?? null, p_cursor_id: cursor && UUID_RE.test(cursor.id) ? cursor.id : null,
      p_limit: PAGE + 1,
    }, z.array(rowSchema))
    rows = data.map((r) => ({
      id: r.id, userId: r.user_id, status: r.status, createdAt: r.created_at, expiresAt: r.expires_at,
      openedAt: r.opened_at, submittedAt: r.submitted_at, revokedAt: r.revoked_at, hasTestimony: r.has_testimony,
    }))
  }
  const page = rows.slice(0, PAGE)
  const last = page.at(-1)
  return { rows: page, nextCursor: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null }
}

export async function revokeTestimonyRequest(ctx: AdminCtx, id: string, reason: RevokeReason): Promise<boolean> {
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Demande introuvable.')
  if (ctx.mode === 'demo') {
    const r = opsDemo().testimonies.find((x) => x.id === id)
    if (!r) throw new RepoError('not_found', 'Demande introuvable.')
    if (!['pending', 'opened', 'in_progress'].includes(r.status)) return false
    const prev = r.status
    r.status = 'revoked'
    r.revokedAt = new Date().toISOString()
    demoAudit('admin.testimony.revoke', { subjectId: r.userId, entity: 'testimony_requests', entityId: id, metadata: { reason, previous_status: prev } })
    return true
  }
  return rpc(ctx, 'admin_revoke_testimony_request', { p_id: id, p_reason: reason }, z.boolean())
}
