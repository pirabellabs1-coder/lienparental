import 'server-only'
/**
 * Quotas du Coach IA (CDC §6.2).
 * - Analyses : gratuit = 3, premium = 10, coparentalité+ = 10 par fenêtre glissante de 30 jours
 *   (ANALYSIS_QUOTA_BY_PLAN, lib/billing/plans.ts), selon le plan EFFECTIF : un parent lié à
 *   un abonné Coparentalité+ bénéficie du quota Premium (getEffectivePlan, 0380). Une analyse =
 *   un appel /api/coach/analyze réussi. Les analyses archivées ou supprimées restent
 *   décomptées jusqu'à leur sortie de la fenêtre (sinon archiver « rendrait » du quota).
 * - Supabase : le décompte s'appuie sur public.ai_usage (0270), registre écrit
 *   UNIQUEMENT par le service_role via reserve_ai_usage() (verrou par utilisateur,
 *   comptage + insertion atomiques). Supprimer ou modifier ses analyses ne rend
 *   donc aucun quota. compute_ai_cycle_window (service_role) n'est pas utilisée.
 * - Démo : compteur en mémoire (lignes d'analyses du magasin mémoire), inchangé.
 * - Chat (assistant + questions de suivi) : non décompté du quota d'analyses, limite
 *   douce de 50 messages / jour / utilisateur (compteur en mémoire, par instance).
 */
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { mockCoachCycles, mockCoachLog, mockCoachUsage } from '@/lib/mock-data'
import type { PlanId } from '@/components/profil/pricing'
import { getEffectivePlan } from '@/lib/billing/entitlements'
import { ANALYSIS_QUOTA_BY_PLAN } from '@/lib/billing/plans'
import {
  CYCLE_DAYS, aiServiceDb, cancelPending, cycleRows, insertPending, newAnalysisUuid, type CoachKind, type StoredAnalysis,
} from './analyses'

export const ANALYSIS_QUOTA: Record<PlanId, number> = ANALYSIS_QUOTA_BY_PLAN
export const CHAT_DAILY_SOFT_LIMIT = 50

const DAY_MS = 86_400_000

export type QuotaStatus = {
  /** Plan effectif (abonnement propre ou accès partagé de la famille). */
  plan: PlanId
  used: number
  quota: number
  remaining: number
  /** Date à laquelle la plus ancienne analyse décomptée sort de la fenêtre (une place se libère). */
  nextReleaseAt: string | null
}

/** Horodatages de consommation (ai_usage en Supabase, magasin mémoire en démo) depuis `since`. */
async function usageTimes(user: CurrentUser, since: Date): Promise<number[]> {
  if (SUPABASE_ENABLED) {
    // Lecture service_role bornée à l'utilisateur (la policy select self suffirait,
    // mais on évite une dépendance à la session pour un contrôle d'accès).
    const { data, error } = await aiServiceDb()
      .from('ai_usage')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('kind', 'analysis')
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .limit(1000)
    if (error) throw new Error('ai_usage read failed')
    return ((data ?? []) as Array<{ created_at: string }>).map((r) => new Date(r.created_at).getTime())
  }
  return (await cycleRows(user, since)).map((r) => new Date(r.cycle).getTime())
}

/** Plan effectif et quota d'analyses associé. */
async function planQuota(user: CurrentUser): Promise<{ plan: PlanId; quota: number }> {
  const { plan } = await getEffectivePlan(user.id, user.plan)
  return { plan, quota: ANALYSIS_QUOTA[plan] ?? ANALYSIS_QUOTA.gratuit }
}

export async function getQuotaStatus(user: CurrentUser): Promise<QuotaStatus> {
  const since = new Date(Date.now() - CYCLE_DAYS * DAY_MS)
  const [times, { plan, quota }] = await Promise.all([usageTimes(user, since), planQuota(user)])
  const used = times.length
  const oldest = [...times].sort((a, b) => a - b)[0]
  return {
    plan,
    used,
    quota,
    remaining: Math.max(0, quota - used),
    nextReleaseAt: oldest ? new Date(oldest + CYCLE_DAYS * DAY_MS).toISOString() : null,
  }
}

/**
 * Réserve une analyse AVANT l'appel au modèle : deux requêtes simultanées ne peuvent pas
 * dépasser le quota (Supabase : reserve_ai_usage sous verrou ; démo : insertion puis
 * recomptage). En cas d'échec, appeler releaseAnalysis. Sans service_role : erreur (fail-closed).
 */
export async function reserveAnalysis(
  user: CurrentUser,
  meta: { kind: CoachKind; title: string },
): Promise<{ ok: true; analysis: StoredAnalysis; status: QuotaStatus } | { ok: false; status: QuotaStatus }> {
  const { quota } = await planQuota(user)
  if (SUPABASE_ENABLED) {
    // Réservation atomique côté base (service_role) AVANT de créer la ligne d'analyse.
    const id = newAnalysisUuid()
    const { data: usageId, error } = await aiServiceDb().rpc('reserve_ai_usage', {
      p_user_id: user.id, p_kind: 'analysis', p_limit: quota, p_window_days: CYCLE_DAYS, p_analysis_id: id,
    })
    if (error) throw new Error('reserve_ai_usage failed')
    if (!usageId) {
      const status = await getQuotaStatus(user)
      return { ok: false, status: { ...status, used: Math.min(status.used, status.quota), remaining: 0 } }
    }
    let analysis: StoredAnalysis
    try {
      analysis = await insertPending(user, { ...meta, id })
    } catch (e) {
      await cancelPending(user, id).catch(() => undefined) // rembourse la réservation orpheline
      throw e
    }
    return { ok: true, analysis, status: await getQuotaStatus(user) }
  }

  const before = await getQuotaStatus(user)
  if (before.remaining <= 0) return { ok: false, status: before }
  const analysis = await insertPending(user, meta)
  const after = await getQuotaStatus(user)
  if (after.used > after.quota) {
    await cancelPending(user, analysis.id)
    return { ok: false, status: { ...after, used: after.quota, remaining: 0 } }
  }
  return { ok: true, analysis, status: after }
}

export async function releaseAnalysis(user: CurrentUser, id: string): Promise<void> {
  await cancelPending(user, id).catch(() => undefined)
}

// --- Limite douce du chat ------------------------------------------------------------

const g = globalThis as unknown as { __lpCoachChat?: Map<string, number> }
const chatCounters: Map<string, number> = (g.__lpCoachChat ??= new Map())

const parisDay = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Cayenne', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Incrémente et vérifie le compteur du jour. */
export function consumeChatMessage(userId: string): { ok: boolean; used: number; limit: number } {
  const key = `${userId}:${parisDay.format(new Date())}`
  if (chatCounters.size > 5000) chatCounters.clear()
  const used = (chatCounters.get(key) ?? 0) + 1
  if (used > CHAT_DAILY_SOFT_LIMIT) return { ok: false, used: CHAT_DAILY_SOFT_LIMIT, limit: CHAT_DAILY_SOFT_LIMIT }
  chatCounters.set(key, used)
  return { ok: true, used, limit: CHAT_DAILY_SOFT_LIMIT }
}

/** Rend un message non servi (erreur fournisseur) au compteur du jour. */
export function refundChatMessage(userId: string): void {
  const key = `${userId}:${parisDay.format(new Date())}`
  const v = chatCounters.get(key)
  if (v && v > 0) chatCounters.set(key, v - 1)
}

// --- Vue « utilisation » -------------------------------------------------------------

export type UsageOverview = QuotaStatus & {
  resetInDays: number | null
  resetDateLabel: string | null
  cycles: Array<{ label: string; startLabel: string; used: number; current: boolean }>
  log: Array<{ id: string; title: string; dateLabel: string; status: 'Terminée' | 'Supprimée' }>
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Cayenne', day: '2-digit', month: 'long', year: 'numeric' })
const fmtShort = new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Cayenne', day: '2-digit', month: 'short' })
const fmtLog = new Intl.DateTimeFormat('fr-FR', { timeZone: 'America/Cayenne', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export async function getUsageOverview(user: CurrentUser): Promise<UsageOverview> {
  const status = await getQuotaStatus(user)
  const now = Date.now()
  const sixCycles = new Date(now - 6 * CYCLE_DAYS * DAY_MS)
  const rows = (await cycleRows(user, sixCycles)).filter((r) => r.status !== 'pending')
  // Consommation réelle (ai_usage) ; le journal ci-dessous reste issu des analyses (titres).
  const usage = await usageTimes(user, sixCycles)
  const cycles = Array.from({ length: 6 }, (_, i) => {
    const back = 5 - i
    const end = now - back * CYCLE_DAYS * DAY_MS
    const start = end - CYCLE_DAYS * DAY_MS
    return {
      label: back === 0 ? 'Cycle actuel' : `Cycle -${back}`,
      startLabel: fmtShort.format(new Date(start)).replace('.', ''),
      used: usage.filter((t) => t > start && t <= end).length,
      current: back === 0,
    }
  })
  const windowStart = now - CYCLE_DAYS * DAY_MS
  const log = rows
    .filter((r) => new Date(r.cycle).getTime() > windowStart)
    .map((r) => ({ id: r.id, title: r.status === 'deleted' ? 'Analyse supprimée' : r.title, dateLabel: fmtLog.format(new Date(r.cycle)).replace(',', ' •'), status: r.status === 'deleted' ? ('Supprimée' as const) : ('Terminée' as const) }))
  const release = status.nextReleaseAt ? new Date(status.nextReleaseAt) : null
  return {
    ...status,
    resetInDays: release ? Math.max(0, Math.ceil((release.getTime() - now) / DAY_MS)) : null,
    resetDateLabel: release ? fmtLong.format(release) : null,
    cycles,
    log,
  }
}

/**
 * Données des écrans « Utilisation » : réelles si Supabase est configuré,
 * exemples de démonstration sinon (affichage inchangé).
 */
export type CoachUsageView = {
  used: number
  total: number
  resetInDays: number | null
  resetDateLabel: string | null
  cycles: UsageOverview['cycles']
  log: UsageOverview['log']
  live: boolean
}

export async function loadCoachUsage(): Promise<CoachUsageView> {
  const user = SUPABASE_ENABLED ? await getCurrentUser() : null
  if (!user) {
    return { used: mockCoachUsage.used, total: mockCoachUsage.total, resetInDays: mockCoachUsage.resetInDays, resetDateLabel: mockCoachUsage.resetDateLabel, cycles: mockCoachCycles, log: mockCoachLog, live: false }
  }
  try {
    const o = await getUsageOverview(user)
    return { used: o.used, total: o.quota, resetInDays: o.resetInDays, resetDateLabel: o.resetDateLabel, cycles: o.cycles, log: o.log, live: true }
  } catch {
    const { quota } = await planQuota(user)
    return { used: 0, total: quota, resetInDays: null, resetDateLabel: null, cycles: [], log: [], live: true }
  }
}
