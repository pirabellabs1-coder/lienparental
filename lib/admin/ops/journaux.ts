import 'server-only'
/**
 * Journal d'audit (lecture seule) : actions d'administration et événements de sécurité.
 * Réel : admin_list_audit (0400), pagination par curseur décroissant sur l'identifiant.
 */
import { z } from 'zod'
import type { AdminCtx } from '@/lib/contenus/repo'
import { DEFAULT_TZ, addDaysToKey, wallTimeToIso } from '@/lib/tz'
import { opsDemo } from './demo'
import { rpc } from './rpc'
import type { AuditFilters, AuditRow } from './types'

const PAGE = 50

const rowSchema = z.object({
  id: z.coerce.string(), created_at: z.string(), action: z.string(), actor_type: z.string(), actor_id: z.string().nullable().catch(null),
  actor_email: z.string().nullable().catch(null), subject_id: z.string().nullable().catch(null), entity: z.string().nullable().catch(null),
  entity_id: z.string().nullable().catch(null), metadata: z.record(z.unknown()).catch({}),
})

export type AuditPage = { rows: AuditRow[]; nextBefore: string | null }

const isSecurity = (a: string) => a.startsWith('security.') || a.startsWith('account.')

export async function listAudit(ctx: AdminCtx, f: AuditFilters): Promise<AuditPage> {
  const from = f.du ? wallTimeToIso(f.du, '00:00', DEFAULT_TZ) : null
  const to = f.au ? wallTimeToIso(addDaysToKey(f.au, 1), '00:00', DEFAULT_TZ) : null
  let rows: AuditRow[]
  if (ctx.mode === 'demo') {
    rows = opsDemo().audit
      .filter((r) => !f.categorie || (f.categorie === 'admin' ? r.actorType === 'admin' : isSecurity(r.action)))
      .filter((r) => !f.action || r.action === f.action)
      .filter((r) => !f.compte || r.subjectId === f.compte)
      .filter((r) => (!from || r.createdAt >= from) && (!to || r.createdAt < to))
      .filter((r) => !f.avant || Number(r.id) < Number(f.avant))
      .slice(0, PAGE + 1)
  } else {
    const data = await rpc(ctx, 'admin_list_audit', {
      p_category: f.categorie ?? null, p_action: f.action ?? null, p_subject: f.compte ?? null, p_from: from, p_to: to,
      p_before_id: f.avant ? Number(f.avant) : null, p_limit: PAGE + 1,
    }, z.array(rowSchema))
    rows = data.map((r) => ({
      id: r.id, createdAt: r.created_at, action: r.action, actorType: r.actor_type, actorEmail: r.actor_email,
      subjectId: r.subject_id, entity: r.entity, entityId: r.entity_id, metadata: r.metadata,
    }))
  }
  const page = rows.slice(0, PAGE)
  return { rows: page, nextBefore: rows.length > PAGE ? page.at(-1)?.id ?? null : null }
}
