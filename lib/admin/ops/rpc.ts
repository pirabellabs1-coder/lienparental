import 'server-only'
/**
 * Appels des fonctions d'administration de 0400_admin_operations.sql avec la session
 * de l'administrateur (client RLS, jamais la service_role). Chaque fonction vérifie
 * elle-même is_admin_aal2() : la garde applicative n'est qu'une première barrière.
 * Les réponses sont revalidées (zod) avant usage ; les erreurs Postgres sont traduites
 * en RepoError (même enveloppe d'erreur que le back-office contenus).
 */
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RepoError, type AdminCtx } from '@/lib/contenus/repo'
import { createServiceClient, type TypedSupabaseClient } from '@/lib/supabase/server'

export type LiveCtx = Extract<AdminCtx, { mode: 'live' }>

type PgErr = { code?: string; message?: string } | null

export function opsError(e: PgErr, op: string): RepoError {
  const code = String(e?.code ?? 'unknown')
  console.warn(`[admin-ops] ${op} a échoué (code ${code})`)
  if (code === '42501' || code === 'PGRST301') return new RepoError('forbidden', 'Accès refusé : droits administrateur et double authentification requis.')
  if (code === 'P0002') return new RepoError('not_found', 'Élément introuvable (supprimé entre-temps ?).')
  if (code === '22023' || code === '22P02' || code === '23514') return new RepoError('invalid', 'Paramètres refusés par la base.')
  if (code === '54000') return new RepoError('invalid', 'Ce fil de discussion a atteint sa taille maximale : ouvrez un nouveau ticket.')
  if (code === 'PGRST202' || code === '42883') return new RepoError('unavailable', 'Fonction absente : appliquez la migration 0400_admin_operations.sql.')
  return new RepoError('unavailable', 'La base de données ne répond pas. Réessayez dans un instant.')
}

/** RPC non typée (fonctions absentes du type Database généré), réponse validée par `schema`. */
export async function rpc<S extends z.ZodTypeAny>(ctx: LiveCtx, fn: string, args: Record<string, unknown>, schema: S): Promise<z.output<S>> {
  const db = ctx.db as SupabaseClient
  const { data, error } = await db.rpc(fn, args)
  if (error) throw opsError(error, fn)
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.warn(`[admin-ops] ${fn} : réponse inattendue (${parsed.error.issues[0]?.path.join('.') ?? '?'})`)
    throw new RepoError('unavailable', 'Réponse inattendue de la base : vérifiez la version de la migration 0400.')
  }
  return parsed.data
}

/** Client service_role (GoTrue admin, Stripe) : uniquement pour les actions qui l'exigent. */
export function serviceClient(): TypedSupabaseClient {
  try {
    return createServiceClient()
  } catch {
    throw new RepoError('unavailable', 'Action indisponible : SUPABASE_SERVICE_ROLE_KEY n’est pas configurée sur le serveur.')
  }
}

/**
 * Journalise une action exécutée hors base (GoTrue, Stripe, export). L'auteur vient de auth.uid().
 * À appeler AVANT l'action : si le journal est indisponible, l'action n'a pas lieu (fail-closed).
 * Un échec de l'action elle-même est ensuite tracé par `admin.account.failed`.
 */
export async function logAdminAction(
  ctx: LiveCtx,
  action: `admin.${string}`,
  opts: { entity?: string; entityId?: string; subject?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const db = ctx.db as SupabaseClient
  const { error } = await db.rpc('admin_log_action', {
    p_action: action,
    p_entity: opts.entity ?? null,
    p_entity_id: opts.entityId ?? null,
    p_subject: opts.subject ?? null,
    p_metadata: opts.metadata ?? {},
  })
  if (error) {
    console.error(`[admin-ops] audit « ${action} » non écrit (code ${error.code ?? 'inconnu'})`)
    if (error.code === '42501') throw opsError(error, 'admin_log_action')
    throw new RepoError('unavailable', 'Journal d’audit indisponible : action annulée. Réessayez dans un instant.')
  }
}

/** Trace l'échec d'une action déjà journalisée (meilleur effort : ne masque pas l'erreur d'origine). */
export async function logAdminFailure(ctx: LiveCtx, action: string, subject: string | null, code: string): Promise<void> {
  try {
    await logAdminAction(ctx, 'admin.account.failed', { entity: 'users', entityId: subject ?? undefined, subject, metadata: { action, code: code.slice(0, 40) } })
  } catch {
    /* déjà signalé dans le journal serveur */
  }
}
