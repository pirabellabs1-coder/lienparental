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
import { WITNESS_BUCKET } from '@/lib/data/server/witness'
import { rpc, serviceClient } from './rpc'
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

/* ---- Signalements de témoignages (0570) --------------------------------
 * L'administrateur voit le motif, les précisions du parent, la référence et les dates ;
 * jamais le contenu du témoignage. Suppression : le témoignage est effacé en base, puis ses
 * pièces jointes du stockage (service_role, chemins renvoyés par la fonction). */

export const REPORT_REASONS = ['test', 'erreur', 'faux', 'abus', 'doublon', 'autre'] as const
export const REPORT_REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  test: 'Envoi d’essai', erreur: 'Envoyé par erreur', faux: 'Faux ou trompeur',
  abus: 'Abusif ou insultant', doublon: 'Doublon', autre: 'Autre motif',
}
export const REPORT_STATUSES = ['open', 'rejected', 'removed'] as const
export type TestimonyReportStatus = (typeof REPORT_STATUSES)[number]
export const REPORT_STATUS_LABEL: Record<TestimonyReportStatus, string> = { open: 'À traiter', rejected: 'Rejeté', removed: 'Témoignage supprimé' }

export type TestimonyReportRow = {
  id: string; testimonyId: string | null; reference: string; ownerId: string; reason: (typeof REPORT_REASONS)[number]
  details: string | null; status: TestimonyReportStatus; note: string | null; decidedAt: string | null; createdAt: string
}

const reportRowSchema = z.object({
  id: z.string(), testimony_id: z.string().nullable(), reference: z.string(), owner_id: z.string(),
  reason_code: z.enum(REPORT_REASONS).catch('autre'), details: z.string().nullable().catch(null),
  status: z.enum(REPORT_STATUSES).catch('open'), decision_note: z.string().nullable().catch(null),
  decided_at: isoN, created_at: z.string(),
})

export async function listTestimonyReports(ctx: AdminCtx, status: TestimonyReportStatus | null = 'open'): Promise<TestimonyReportRow[]> {
  if (ctx.mode === 'demo') return []
  const data = await rpc(ctx, 'admin_list_testimony_reports', { p_status: status, p_limit: 100 }, z.array(reportRowSchema))
  return data.map((r) => ({
    id: r.id, testimonyId: r.testimony_id, reference: r.reference, ownerId: r.owner_id, reason: r.reason_code,
    details: r.details, status: r.status, note: r.decision_note, decidedAt: r.decided_at, createdAt: r.created_at,
  }))
}

export async function decideTestimonyReport(ctx: AdminCtx, id: string, decision: 'rejected' | 'removed', note?: string): Promise<{ status: string; filesRemoved: number }> {
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Signalement introuvable.')
  if (ctx.mode === 'demo') throw new RepoError('unavailable', 'Action indisponible en démonstration.')
  const out = await rpc(ctx, 'admin_decide_testimony_report', { p_report_id: id, p_decision: decision, p_note: note?.trim() || null },
    z.object({ status: z.string(), attachments: z.array(z.string()).catch([]) }))
  let filesRemoved = 0
  if (decision === 'removed' && out.attachments.length) {
    // Le témoignage est déjà supprimé : un échec ici laisse des fichiers orphelins, sans bloquer la décision.
    const paths = out.attachments.map((p) => p.replace(new RegExp(`^${WITNESS_BUCKET}/`), ''))
    try {
      const { error } = await serviceClient().storage.from(WITNESS_BUCKET).remove(paths)
      if (error) console.warn('[admin-ops] pièces du témoignage non effacées du stockage')
      else filesRemoved = paths.length
    } catch {
      console.warn('[admin-ops] stockage indisponible : pièces du témoignage non effacées')
    }
  }
  return { status: out.status, filesRemoved }
}
