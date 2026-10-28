import 'server-only'
/**
 * Comptes utilisateurs (back-office) : liste paginée et filtrable, fiche MINIMALE,
 * actions journalisées et export CSV minimisé.
 *
 * Réel : fonctions admin_list_accounts / admin_get_account / admin_revoke_user_sessions
 * (0400) et admin_moderate_account / admin_accounts_moderation / admin_account_moderation
 * (0500), is_admin_aal2 vérifié en base, avec la session de l'admin ; GoTrue admin
 * (service_role) uniquement pour le ban (suspendre, désactiver, réactiver), renvoyer
 * l'e-mail et supprimer. Démonstration : magasin mémoire (lib/admin/ops/demo.ts).
 *
 * Modération : règles des transitions et validation dans ./moderation (module pur, testé).
 */
import { z } from 'zod'
import { RepoError, type AdminCtx } from '@/lib/contenus/repo'
import { csvCell } from '@/lib/admin/stats/csv'
import { softDeleteAccount } from '@/lib/account/deletion'
import { DEFAULT_TZ, addDaysToKey, dayKeyInTz, wallTimeToIso } from '@/lib/tz'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from '@/lib/notify/server'
import { DEMO_ACTOR, demoAudit, opsDemo } from './demo'
import { logAdminAction, logAdminFailure, opsError, rpc, serviceClient, type LiveCtx } from './rpc'
import {
  ACCOUNT_PLANS, ACCOUNT_STATUSES, PLAN_LABEL, STATUS_LABEL, decodeCursor, deviceLabel, encodeCursor,
  type AccountDetail, type AccountFilters, type AccountListItem, type AccountModeration, type AccountRow,
} from './types'
import {
  KIND_OF_ACTION, MODERATION_KINDS, MODERATION_REASONS, actionAvailability, banDurationFor, legacyStatus, moderationState,
  restoreBanDuration, suspensionUntil,
  type ActionBody, type ModAction, type ModerationAction, type ModerationEntry, type ModerationTarget,
} from './moderation'

const PAGE = 50
const EXPORT_MAX = 10_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const iso = z.string().min(1)
const isoN = iso.nullable().catch(null)

const rowSchema = z.object({
  id: z.string(),
  email: z.string().catch(''),
  prenom: z.string().nullable().catch(null),
  nom: z.string().nullable().catch(null),
  plan: z.enum(ACCOUNT_PLANS).catch('free'),
  status: z.enum(ACCOUNT_STATUSES).catch('actif'),
  created_at: iso,
  last_sign_in_at: isoN,
  email_verified: z.boolean().catch(false),
  mfa_enabled: z.boolean().catch(false),
  storage_mb: z.coerce.number().catch(0),
  children_count: z.coerce.number().catch(0),
})

const toRow = (r: z.infer<typeof rowSchema>): AccountRow => ({
  id: r.id, email: r.email, prenom: r.prenom, nom: r.nom, plan: r.plan, status: r.status,
  createdAt: r.created_at, lastSignInAt: r.last_sign_in_at, emailVerified: r.email_verified,
  mfaEnabled: r.mfa_enabled, storageMb: r.storage_mb, childrenCount: r.children_count,
})

/** Bornes de dates (jours civils en Guyane, borne haute incluse). */
function bounds(f: AccountFilters): { from: string | null; to: string | null } {
  return {
    from: f.du ? wallTimeToIso(f.du, '00:00', DEFAULT_TZ) : null,
    to: f.au ? wallTimeToIso(addDaysToKey(f.au, 1), '00:00', DEFAULT_TZ) : null,
  }
}

async function livePage(ctx: LiveCtx, f: AccountFilters, cursor: { createdAt: string; id: string } | null, limit: number): Promise<AccountRow[]> {
  const { from, to } = bounds(f)
  const rows = await rpc(ctx, 'admin_list_accounts', {
    p_search: f.q ?? null, p_plan: f.plan ?? null, p_status: f.statut ?? null, p_from: from, p_to: to,
    p_cursor_created: cursor?.createdAt ?? null, p_cursor_id: cursor && UUID_RE.test(cursor.id) ? cursor.id : null,
    p_limit: limit,
  }, z.array(rowSchema))
  return rows.map(toRow)
}

const norm = (s: string) => s.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Démo : statut recalculé à chaque lecture (une suspension expire seule, comme le ban GoTrue). */
function demoAccounts() {
  const now = Date.now()
  return opsDemo().accounts.map((a) => ({ ...a, status: legacyStatus(moderationState(a, now).state) }))
}

function demoPage(f: AccountFilters, cursor: { createdAt: string; id: string } | null, limit: number): AccountRow[] {
  const { from, to } = bounds(f)
  const needle = f.q ? norm(f.q) : ''
  return demoAccounts()
    .filter((a) => (f.statut ? a.status === f.statut : a.status !== 'supprime'))
    .filter((a) => !f.plan || a.plan === f.plan)
    .filter((a) => !needle || norm(`${a.email} ${a.prenom ?? ''} ${a.nom ?? ''}`).includes(needle) || a.id === f.q)
    .filter((a) => (!from || a.createdAt >= from) && (!to || a.createdAt < to))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .filter((a) => !cursor || a.createdAt < cursor.createdAt || (a.createdAt === cursor.createdAt && a.id < cursor.id))
    .slice(0, limit)
    .map(({ deletedAt: _d, bannedUntil: _b, ...row }) => row)
}

export type AccountPage = { rows: AccountListItem[]; nextCursor: string | null }

const modListSchema = z.array(z.object({ user_id: z.string(), banned_until: isoN, warnings: z.coerce.number().catch(0) }))

/** Repli sans journal 0500 : état d'après le statut de la liste (sans date de fin ni avertissements). */
function fallbackModeration(r: AccountRow): AccountModeration {
  return { state: r.status, until: null, warnings: null }
}

/** Fin de ban et avertissements d'une page de comptes (0500) ; absent : repli, la liste reste utilisable. */
async function moderationFor(ctx: AdminCtx, rows: AccountRow[]): Promise<Map<string, AccountModeration>> {
  const out = new Map<string, AccountModeration>()
  const now = Date.now()
  if (ctx.mode === 'demo') {
    const s = opsDemo()
    for (const r of rows) {
      const a = s.accounts.find((x) => x.id === r.id)
      if (!a) continue
      out.set(r.id, { ...moderationState(a, now), warnings: s.moderation.filter((m) => m.userId === r.id && m.kind === 'warning').length })
    }
    return out
  }
  const ids = rows.map((r) => r.id).filter((id) => UUID_RE.test(id))
  if (ids.length === 0) return out
  try {
    const data = await rpc(ctx, 'admin_accounts_moderation', { p_ids: ids }, modListSchema)
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const m of data) {
      const r = byId.get(m.user_id)
      if (!r) continue
      const st = moderationState({ deletedAt: r.status === 'supprime' ? r.createdAt : null, bannedUntil: m.banned_until, emailVerified: r.emailVerified }, now)
      out.set(m.user_id, { ...st, warnings: m.warnings })
    }
  } catch {
    /* journal 0500 absent ou indisponible : repli (déjà signalé dans le journal serveur) */
  }
  return out
}

export async function listAccounts(ctx: AdminCtx, f: AccountFilters): Promise<AccountPage> {
  const cursor = decodeCursor(f.apres)
  const rows = ctx.mode === 'demo' ? demoPage(f, cursor, PAGE + 1) : await livePage(ctx, f, cursor, PAGE + 1)
  const more = rows.length > PAGE
  const page = rows.slice(0, PAGE)
  const last = page.at(-1)
  const mods = await moderationFor(ctx, page)
  return {
    rows: page.map((r) => ({ ...r, moderation: mods.get(r.id) ?? fallbackModeration(r) })),
    nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null,
  }
}

// --- Fiche ------------------------------------------------------------------------------

const detailSchema = z.object({
  profile: z.object({
    id: z.string(), email: z.string().catch(''), prenom: z.string().nullable().catch(null), nom: z.string().nullable().catch(null),
    plan: z.enum(ACCOUNT_PLANS).catch('free'), created_at: iso, deleted_at: isoN, email_verified: z.boolean().catch(false),
    mfa_enabled: z.boolean().catch(false), storage_mb: z.coerce.number().catch(0), last_sign_in_at: isoN, banned_until: isoN,
    children_count: z.coerce.number().catch(0),
  }),
  effective: z.object({ plan: z.enum(['free', 'premium', 'coparentalite']).catch('free'), own_plan: z.string().catch('free'), via: z.enum(['abonnement', 'famille']).nullable().catch(null) })
    .nullable().catch(null),
  sessions: z.array(z.object({ created_at: iso, last_seen_at: iso, user_agent: z.string().catch(''), aal: z.string().nullable().catch(null) })).catch([]),
  subscription: z.object({
    plan: z.string(), status: z.string(), current_period_end: isoN, cancel_at_period_end: z.boolean().catch(false), canceled_at: isoN,
    created_at: isoN, stripe_customer_id: z.string().nullable().catch(null), stripe_subscription_id: z.string().nullable().catch(null),
  }).nullable().catch(null),
  payments: z.array(z.object({ amount_cents: z.coerce.number(), currency: z.string().catch('EUR'), status: z.string(), paid_at: isoN, created_at: iso })).catch([]),
  audit: z.array(z.object({ id: z.coerce.string(), action: z.string(), actor_type: z.string(), created_at: iso })).catch([]),
  open_tickets: z.coerce.number().catch(0),
}).nullable()

function statusOf(p: { deleted_at: string | null; banned_until: string | null; email_verified: boolean }): AccountRow['status'] {
  return legacyStatus(moderationState({ deletedAt: p.deleted_at, bannedUntil: p.banned_until, emailVerified: p.email_verified }).state)
}

const modDetailSchema = z.object({
  warnings: z.coerce.number().catch(0),
  history: z.array(z.object({
    id: z.coerce.string(),
    kind: z.enum(MODERATION_KINDS),
    reason_code: z.enum(MODERATION_REASONS).nullable().catch(null),
    reason: z.string().nullable().catch(null),
    until: isoN,
    created_at: iso,
    admin_email: z.string().nullable().catch(null),
  })).catch([]),
})

async function liveModeration(ctx: LiveCtx, id: string): Promise<{ warnings: number | null; history: ModerationEntry[] | null }> {
  try {
    const m = await rpc(ctx, 'admin_account_moderation', { p_user_id: id }, modDetailSchema)
    return {
      warnings: m.warnings,
      history: m.history.map((h) => ({
        id: h.id, kind: h.kind, reasonCode: h.reason_code, reason: h.reason, until: h.until, createdAt: h.created_at, adminEmail: h.admin_email,
      })),
    }
  } catch {
    return { warnings: null, history: null } // journal 0500 absent : la fiche reste consultable
  }
}

export async function getAccount(ctx: AdminCtx, id: string): Promise<AccountDetail> {
  if (ctx.mode === 'demo') return demoDetail(id)
  if (!UUID_RE.test(id)) throw new RepoError('not_found', 'Compte introuvable.')
  const d = await rpc(ctx, 'admin_get_account', { p_id: id }, detailSchema)
  if (!d) throw new RepoError('not_found', 'Compte introuvable.')
  const p = d.profile
  const mod = await liveModeration(ctx, id)
  return {
    moderation: {
      ...moderationState({ deletedAt: p.deleted_at, bannedUntil: p.banned_until, emailVerified: p.email_verified }),
      warnings: mod.warnings, history: mod.history,
    },
    profile: {
      id: p.id, email: p.email, prenom: p.prenom, nom: p.nom, plan: p.plan, status: statusOf(p), createdAt: p.created_at,
      lastSignInAt: p.last_sign_in_at, emailVerified: p.email_verified, mfaEnabled: p.mfa_enabled, storageMb: p.storage_mb,
      childrenCount: p.children_count, deletedAt: p.deleted_at, bannedUntil: p.banned_until,
    },
    effective: d.effective ? { plan: d.effective.plan, ownPlan: d.effective.own_plan, via: d.effective.via } : { plan: 'free', ownPlan: 'free', via: null },
    sessions: d.sessions.map((s) => ({ createdAt: s.created_at, lastSeenAt: s.last_seen_at, device: deviceLabel(s.user_agent), aal: s.aal })),
    subscription: d.subscription ? {
      plan: d.subscription.plan, status: d.subscription.status, currentPeriodEnd: d.subscription.current_period_end,
      cancelAtPeriodEnd: d.subscription.cancel_at_period_end, canceledAt: d.subscription.canceled_at, createdAt: d.subscription.created_at,
      stripeCustomerId: d.subscription.stripe_customer_id, stripeSubscriptionId: d.subscription.stripe_subscription_id,
    } : null,
    payments: d.payments.map((x) => ({ amountCents: x.amount_cents, currency: x.currency, status: x.status, paidAt: x.paid_at, createdAt: x.created_at })),
    audit: d.audit.map((a) => ({ id: a.id, action: a.action, actorType: a.actor_type, createdAt: a.created_at })),
    openTickets: d.open_tickets,
  }
}

function demoDetail(id: string): AccountDetail {
  const s = opsDemo()
  const a = s.accounts.find((x) => x.id === id)
  if (!a) throw new RepoError('not_found', 'Compte introuvable.')
  const paid = a.plan === 'premium' || a.plan === 'coparentalite'
  const now = Date.now()
  const history = s.moderation.filter((m) => m.userId === id).map(({ userId: _u, ...m }) => m)
  return {
    profile: { ...a, status: legacyStatus(moderationState(a, now).state) },
    moderation: { ...moderationState(a, now), warnings: history.filter((m) => m.kind === 'warning').length, history },
    effective: { plan: a.plan === 'admin' ? 'free' : a.plan, ownPlan: a.plan, via: paid ? 'abonnement' : null },
    sessions: a.lastSignInAt ? [
      { createdAt: a.lastSignInAt, lastSeenAt: a.lastSignInAt, device: 'Safari · iOS', aal: a.mfaEnabled ? 'aal2' : 'aal1' },
      { createdAt: new Date(now - 9 * 86_400_000).toISOString(), lastSeenAt: new Date(now - 3 * 86_400_000).toISOString(), device: 'Chrome · Windows', aal: 'aal1' },
    ] : [],
    subscription: paid ? {
      plan: a.plan === 'coparentalite' ? 'coparentalite_monthly' : 'premium_monthly', status: 'active',
      currentPeriodEnd: new Date(now + 12 * 86_400_000).toISOString(), cancelAtPeriodEnd: false, canceledAt: null,
      createdAt: a.createdAt, stripeCustomerId: `cus_demo${a.id.slice(2)}`, stripeSubscriptionId: `sub_demo${a.id.slice(2)}`,
    } : null,
    payments: paid ? [0, 1, 2].map((i) => ({
      amountCents: a.plan === 'coparentalite' ? 1199 : 699, currency: 'EUR', status: 'succeeded',
      paidAt: new Date(now - (18 + 30 * i) * 86_400_000).toISOString(), createdAt: new Date(now - (18 + 30 * i) * 86_400_000).toISOString(),
    })) : [],
    audit: s.audit.filter((l) => l.subjectId === id).slice(0, 15).map((l) => ({ id: l.id, action: l.action, actorType: l.actorType, createdAt: l.createdAt })),
    openTickets: s.tickets.filter((t) => t.requester.id === id && ['open', 'in_progress', 'waiting_user'].includes(t.status)).length,
  }
}

// --- Actions -------------------------------------------------------------------------------

export type ActionResult = { ok: true; message: string }

/** Le compte affiché est-il celui de l'administrateur connecté ? (démo : adresse du compte admin de démo) */
export function isSelfAccount(ctx: AdminCtx, profile: { id: string; email: string }): boolean {
  return ctx.mode === 'live' ? profile.id === ctx.userId : profile.email.toLowerCase() === DEMO_ACTOR
}

export function targetOf(ctx: AdminCtx, d: AccountDetail): ModerationTarget {
  return {
    state: d.moderation.state, until: d.moderation.until, isAdmin: d.profile.plan === 'admin',
    isSelf: isSelfAccount(ctx, d.profile), emailVerified: d.profile.emailVerified,
  }
}

/** Refus explicite (même texte que l'interface) si l'action n'est pas permise sur ce compte. */
function assertAllowed(ctx: AdminCtx, d: AccountDetail, action: ModAction) {
  const av = actionAvailability(targetOf(ctx, d))[action]
  if (!av.allowed) throw new RepoError(av.code, av.reason)
}

const MESSAGES: Record<ActionBody['action'], string> = {
  warn: 'Avertissement enregistré.',
  suspend: 'Compte suspendu : connexion bloquée et sessions fermées jusqu’à la date de fin.',
  deactivate: 'Compte désactivé : connexion bloquée et sessions fermées jusqu’à réactivation.',
  reactivate: 'Compte réactivé : la connexion est de nouveau possible.',
  resend_verification: 'E-mail de vérification renvoyé.',
  force_logout: 'Déconnexion forcée effectuée',
}

export async function runAccountAction(ctx: AdminCtx, id: string, body: ActionBody): Promise<ActionResult> {
  const d = await getAccount(ctx, id)
  assertAllowed(ctx, d, body.action)

  if (body.action === 'warn' || body.action === 'suspend' || body.action === 'deactivate' || body.action === 'reactivate') {
    return moderate(ctx, d, body)
  }

  if (ctx.mode === 'demo') {
    demoAudit(`admin.account.${body.action}`, { subjectId: id, entity: 'users', entityId: id })
    return { ok: true, message: MESSAGES[body.action] }
  }

  if (body.action === 'force_logout') {
    const n = await rpc(ctx, 'admin_revoke_user_sessions', { p_user_id: id }, z.coerce.number())
    return { ok: true, message: `${MESSAGES.force_logout} (${n} session${n > 1 ? 's' : ''}).` }
  }

  // resend_verification : nouveau code d'inscription (limites d'envoi GoTrue appliquées).
  const admin = serviceClient()
  await logAdminAction(ctx, 'admin.account.resend_verification', { entity: 'users', entityId: id, subject: id })
  const { error } = await admin.auth.resend({ type: 'signup', email: d.profile.email })
  if (error) {
    await logAdminFailure(ctx, body.action, id, String(error.code ?? error.status ?? 'auth'))
    throw new RepoError(error.status === 429 ? 'conflict' : 'unavailable',
      error.status === 429 ? 'Un e-mail vient déjà d’être envoyé : patientez quelques minutes.' : 'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant.')
  }
  return { ok: true, message: MESSAGES.resend_verification }
}

type ModerationBody = Extract<ActionBody, { action: ModerationAction }>

/**
 * Avertir / suspendre / désactiver / réactiver.
 * Ordre (réel) : 1. ban GoTrue (sauf avertissement) ; 2. décision + audit en UNE transaction
 * (admin_moderate_account, 0500) ; en cas d'échec, le ban antérieur est rétabli : aucune action
 * ne subsiste sans trace ; 3. fermeture des sessions (suspension, désactivation) ; 4. e-mail et
 * notification in-app dans la langue de l'utilisateur (jamais bloquant).
 */
async function moderate(ctx: AdminCtx, d: AccountDetail, body: ModerationBody): Promise<ActionResult> {
  const id = d.profile.id
  const kind = KIND_OF_ACTION[body.action]
  const now = Date.now()
  const until = body.action === 'suspend' ? suspensionUntil(body.duration, now) : null
  const reasonCode = body.action === 'reactivate' ? null : body.reason
  const details = body.details?.trim() || null

  if (ctx.mode === 'demo') {
    const s = opsDemo()
    const a = s.accounts.find((x) => x.id === id)!
    if (body.action === 'suspend') a.bannedUntil = until
    if (body.action === 'deactivate') a.bannedUntil = new Date(now + 100 * 365 * 86_400_000).toISOString()
    if (body.action === 'reactivate') a.bannedUntil = null
    a.status = legacyStatus(moderationState(a, now).state)
    const entryId = randomUUID()
    s.moderation.unshift({ id: entryId, userId: id, kind, reasonCode, reason: details, until, createdAt: new Date(now).toISOString(), adminEmail: DEMO_ACTOR })
    demoAudit(`admin.account.${body.action}`, {
      subjectId: id, entity: 'users', entityId: id,
      metadata: { moderation_id: entryId, ...(reasonCode ? { reason_code: reasonCode } : {}), ...(until ? { until } : {}) },
    })
    return { ok: true, message: `${MESSAGES[body.action]} Démonstration : aucun e-mail ni notification envoyés.` }
  }

  const ban = banDurationFor(body)
  const admin = ban ? serviceClient() : null
  if (admin && ban) {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ban })
    if (error) {
      await logAdminFailure(ctx, body.action, id, String(error.code ?? error.status ?? 'auth'))
      throw new RepoError('unavailable', 'Le service d’authentification a refusé la modification. Réessayez dans un instant.')
    }
  }

  let entryId: string
  try {
    entryId = await recordModeration(ctx, { userId: id, kind, reasonCode, details, until })
  } catch (e) {
    if (admin) {
      // Annulation : rétablit l'état de connexion antérieur (le journal fait foi, fail-closed).
      const { error: rollbackError } = await admin.auth.admin
        .updateUserById(id, { ban_duration: restoreBanDuration(d.profile.bannedUntil) })
        .catch((err: unknown) => ({ error: err }))
      // Annulation impossible : le compte reste dans l'état du ban sans entrée de journal → on le trace.
      if (rollbackError) await logAdminFailure(ctx, body.action, id, 'ban_rollback_failed')
    }
    await logAdminFailure(ctx, body.action, id, 'moderation_log')
    throw e
  }

  // Suspendre / désactiver ferme aussi les sessions ouvertes (le jeton d'accès en cours expire sous 1 h).
  let sessionsClosed = true
  if (body.action === 'suspend' || body.action === 'deactivate') {
    sessionsClosed = await rpc(ctx, 'admin_revoke_user_sessions', { p_user_id: id }, z.coerce.number()).then(() => true, () => false)
  }

  const sent = await notify(id, 'account_moderation', { kind, reason_code: reasonCode, details, until }, { dedupeKey: `moderation:${entryId}` })
  const informed = sent.delivered.includes('email')
    ? 'L’utilisateur a été prévenu par e-mail et dans l’application.'
    : sent.delivered.includes('inapp')
      ? 'Notification in-app envoyée ; l’e-mail n’a pas pu partir.'
      : 'Attention : l’utilisateur n’a pas pu être prévenu (e-mail et notification indisponibles).'
  const sessionsNote = sessionsClosed ? '' : ' Attention : les sessions ouvertes n’ont pas pu être fermées (utilisez « Déconnecter »).'
  return { ok: true, message: `${MESSAGES[body.action]} ${informed}${sessionsNote}` }
}

/** Écrit la décision et sa ligne d'audit (0500). Erreurs traduites, migration absente signalée. */
async function recordModeration(ctx: LiveCtx, m: {
  userId: string; kind: ModerationEntry['kind']; reasonCode: string | null; details: string | null; until: string | null
}): Promise<string> {
  const db = ctx.db as SupabaseClient
  const { data, error } = await db.rpc('admin_moderate_account', {
    p_user_id: m.userId, p_kind: m.kind, p_reason_code: m.reasonCode, p_reason: m.details, p_until: m.until,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
      console.error('[admin-ops] admin_moderate_account absente : migration 0500 non appliquée')
      throw new RepoError('unavailable', 'Journal de modération absent : appliquez la migration 0500_moderation.sql. Action annulée.')
    }
    throw opsError(error, 'admin_moderate_account')
  }
  const parsed = z.string().min(1).safeParse(data)
  if (!parsed.success) throw new RepoError('unavailable', 'Réponse inattendue de la base : vérifiez la migration 0500.')
  return parsed.data
}

/**
 * Suppression par un administrateur : même logique que la suppression par l'utilisateur
 * (résiliation Stripe immédiate, anonymisation, soft delete GoTrue, purge à 30 jours).
 * La double confirmation est vérifiée ici : l'admin doit retaper l'adresse exacte du compte.
 */
export async function deleteAccountAsAdmin(ctx: AdminCtx, id: string, confirmEmail: string): Promise<ActionResult> {
  const d = await getAccount(ctx, id)
  assertAllowed(ctx, d, 'delete')
  if (confirmEmail.trim().toLowerCase() !== d.profile.email.trim().toLowerCase()) {
    throw new RepoError('invalid', 'L’adresse saisie ne correspond pas à celle du compte.', [{ path: 'email', message: 'Adresse différente.' }])
  }
  if (ctx.mode === 'demo') {
    const a = opsDemo().accounts.find((x) => x.id === id)!
    a.deletedAt = new Date().toISOString()
    a.status = 'supprime'
    a.email = `deleted+${id}@deleted.invalid`
    a.prenom = null
    a.nom = null
    demoAudit('admin.account.delete', { subjectId: id, entity: 'users', entityId: id, metadata: { purge_after_days: 30 } })
    return { ok: true, message: 'Compte supprimé : identité anonymisée, données purgées sous 30 jours.' }
  }
  const admin = serviceClient()
  await logAdminAction(ctx, 'admin.account.delete', {
    entity: 'users', entityId: id, subject: id, metadata: { purge_after_days: 30, had_subscription: !!d.subscription },
  })
  const res = await softDeleteAccount(admin, id)
  if (!res.ok) {
    await logAdminFailure(ctx, 'delete', id, res.code)
    if (res.code === 'billing_unavailable') throw new RepoError('unavailable', 'La résiliation Stripe a échoué : rien n’a été supprimé. Réessayez dans un instant.')
    if (res.code === 'delete_failed') throw new RepoError('unavailable', 'La suppression a échoué : rien n’a été modifié dans le profil.')
    throw new RepoError('unavailable', 'Suppression partielle : le profil est anonymisé mais la connexion n’a pas pu être fermée. Relancez la suppression.')
  }
  return { ok: true, message: res.stripeCanceled ? 'Compte supprimé et abonnement Stripe résilié.' : 'Compte supprimé : identité anonymisée, données purgées sous 30 jours.' }
}

// --- Export CSV ------------------------------------------------------------------------------

const yesNo = (b: boolean) => (b ? 'oui' : 'non')
const dateFr = (iso: string | null) => (iso ? dayKeyInTz(iso, DEFAULT_TZ) : '')

/**
 * Export minimisé : identifiant, e-mail (contact opérationnel), formule, statut, dates,
 * indicateurs de sécurité, volume de stockage et NOMBRE d'enfants. Ni nom, ni coordonnées,
 * ni santé, ni contenu. Cellules protégées contre l'injection de formules (csvCell).
 */
export async function exportAccountsCsv(ctx: AdminCtx, f: AccountFilters): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const all: AccountRow[] = []
  let cursor: { createdAt: string; id: string } | null = null
  const filters = { ...f, apres: undefined }
  while (all.length <= EXPORT_MAX) {
    const batch: AccountRow[] = ctx.mode === 'demo' ? demoPage(filters, cursor, 1000) : await livePage(ctx, filters, cursor, 1000)
    all.push(...batch)
    const last = batch.at(-1)
    if (batch.length < 1000 || !last) break
    cursor = { createdAt: last.createdAt, id: last.id }
  }
  const truncated = all.length > EXPORT_MAX
  const rows = all.slice(0, EXPORT_MAX)

  const meta = {
    rows: rows.length, truncated, plan: f.plan ?? null, statut: f.statut ?? null, du: f.du ?? null, au: f.au ?? null,
    recherche: Boolean(f.q), // le texte recherché n'est pas journalisé (il peut contenir une adresse)
  }
  if (ctx.mode === 'demo') demoAudit('admin.account.export', { entity: 'users', metadata: meta })
  else await logAdminAction(ctx, 'admin.account.export', { entity: 'users', metadata: meta })

  const header = ['Identifiant', 'E-mail', 'Formule', 'Statut', 'Inscription', 'Dernière connexion', 'E-mail vérifié', 'Double authentification', 'Stockage (Mo)', 'Enfants (nombre)']
  const lines = [header, ...rows.map((r) => [
    r.id, r.email, PLAN_LABEL[r.plan], STATUS_LABEL[r.status], dateFr(r.createdAt), dateFr(r.lastSignInAt),
    yesNo(r.emailVerified), yesNo(r.mfaEnabled), r.storageMb, r.childrenCount,
  ])].map((cells) => cells.map(csvCell).join(';'))
  return { csv: '﻿' + lines.join('\r\n') + '\r\n', rows: rows.length, truncated }
}
